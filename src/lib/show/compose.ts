import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { generate } from "@/lib/ai/server";
import { generateImage, imagesEnabled } from "@/lib/ai/image";
import { pick } from "@/lib/settings-store";
import { loadSettings } from "@/lib/settings";
import { sendMediaGroup, sendMessage, telegramEnabled } from "@/lib/automation/telegram";
import { publishIgPost, upload } from "@/lib/instagram/compose";
import { igAccount } from "@/lib/instagram/oauth";
import { latestAiNews, POLITICAL, type NewsItem } from "./news";
import { programById, programFor, type Program } from "./programs";
import { avatarData, tweetImage, tweetSlide, type Author, type TweetSlide } from "./art";

/**
 * Programa diário do Instagram da OutBox: um carrossel no formato tweet por dia, com o programa
 * da grade. Fica pronto 1 hora antes, vai para o Telegram com o botão de cancelar (janela de veto)
 * e é publicado sozinho no horário.
 */

const TZ = "America/Sao_Paulo";
const VETO_MINUTES = 60;

/** Estilo das imagens de apoio: claras, editoriais, no clima do modo claro da OutBox. */
const SHOW_IMAGE_STYLE =
  " Clean, bright editorial image with soft natural light, white and light warm-grey surroundings and a small touch of orange (#F15532) as an accent in an object or light." +
  " Real proportions, nothing floating or oversized. No text, letters, numbers, logos, brand marks or watermarks; no readable screens or app interfaces; no real or famous people.";

const MEME_IMAGE_STYLE =
  " Playful, original 3D cartoon illustration with expressive characters, bright clean background, soft studio light, a touch of orange (#F15532)." +
  " Funny but tasteful. No text, letters, speech bubbles, logos or real people.";

export type ShowContext = { clientId: string; author: Author; chatId: string | null };

/** Cliente OutBox, conta do Instagram conectada e o autor dos posts (foto e nome do Felipe). */
export async function showContext(): Promise<ShowContext> {
  const { data: c } = await db().from("clients").select("id, telegram_chat_id").ilike("name", "OutBox%").neq("status", "archived").limit(1).maybeSingle();
  const client = c as { id: string; telegram_chat_id: string | null } | null;
  if (!client) throw new Error("Cliente OutBox não encontrado.");
  const acc = await igAccount(client.id);
  if (!acc) throw new Error("O Instagram da OutBox não está conectado.");
  const { data: p } = await db()
    .from("profiles")
    .select("name, avatar_url")
    .eq("role", "admin")
    .eq("status", "active")
    .not("avatar_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const profile = p as { name: string | null; avatar_url: string | null } | null;
  return {
    clientId: client.id,
    chatId: client.telegram_chat_id,
    author: { name: profile?.name?.trim() || "Felipe Melo", handle: acc.username ?? "eusoufelipemelo", avatar: await avatarData(profile?.avatar_url ?? null) },
  };
}

const slideSchema = z.object({
  text: z.string().describe("Texto da lâmina: 1 ou 2 frases curtas, 60 a 130 caracteres, sem rótulo no começo (nada de 'O caso:', 'Fechamento:', nome do quadro), sem markdown, sem asteriscos."),
  bold: z.string().describe("Uma frase de impacto, 20 a 70 caracteres, com ideia NOVA: não repete nem resume o texto da mesma lâmina. Sem asteriscos."),
  image_prompt: z.string().describe("Cena da imagem de apoio em inglês, 1 frase concreta e visual. Nunca cite marcas, empresas, produtos ou pessoas reais; objetos genéricos e sem logotipo."),
});

const postSchema = z.object({
  cover: slideSchema.describe("Capa: só o gancho que faz parar de rolar (curiosidade ou benefício), sem contar a notícia inteira. O negrito chama para arrastar."),
  slides: z.array(slideSchema).describe("Lâminas de conteúdo, em ordem. Cada uma traz uma informação nova; nenhuma repete a capa ou outra lâmina."),
  closing: z.string().describe("Frase final da última lâmina (sem imagem), até 110 caracteres, sem rótulo e sem asteriscos."),
  caption: z.string().describe("Legenda em português do Brasil, 3 a 5 parágrafos curtos (500 a 1100 caracteres): contexto, o que muda na prática, uma pergunta para quem tem empresa e um convite para comentar. Sem hashtags e sem a palavra Fonte (o sistema coloca)."),
  hashtags: z.array(z.string()).describe("6 a 12 hashtags sem #, em português, sobre IA e negócios."),
  sources: z.array(z.string()).describe("Links das notícias usadas (exatamente como vieram na lista). Vazio se o programa não usa notícias."),

});

/** Tira markdown, rótulos e repetição; corta no fim de uma frase para caber na lâmina. */
function clean(text: string, max: number, program?: string): string {
  let t = text.replace(/\*\*?|__|#{1,6}\s/g, "").replace(/\s+/g, " ").trim();
  if (program) t = t.replace(new RegExp(`^${program.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:!.\\s-]*`, "i"), "").trim();
  t = t.replace(/^(o caso|o detalhe que importa|fechamento|resumo|contexto|minha opini[aã]o|gancho|capa)\s*:\s*/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function slideText(s: { text: string; bold: string }, program: string): { text: string; bold: string } {
  let bold = clean(s.bold, 80, program);
  let text = clean(s.text, 140, program);
  // o negrito às vezes vem repetido (ou só reescrito) dentro do texto
  if (bold && text.includes(bold)) text = text.replace(bold, "").replace(/\s+/g, " ").trim();
  if (bold && text && overlap(text, bold) >= 0.6) bold = "";
  if (!text) return { text: bold, bold: "" };
  return { text, bold };
}

function newsBlock(news: NewsItem[]): string {
  return news.map((n, i) => `${i + 1}. [${n.source}] ${n.title}${n.summary ? ` — ${n.summary.slice(0, 240)}` : ""}\n   ${n.link}`).join("\n");
}

async function recentTitles(clientId: string): Promise<string[]> {
  const { data } = await db().from("ig_posts").select("slides").eq("client_id", clientId).eq("source", "show").order("created_at", { ascending: false }).limit(14);
  return ((data ?? []) as { slides: { title?: string }[] }[]).map((r) => r.slides?.[0]?.title ?? "").filter(Boolean);
}

type PostDraft = z.infer<typeof postSchema>;

function isPolitical(p: PostDraft): boolean {
  const all = [p.cover.text, p.cover.bold, ...p.slides.flatMap((x) => [x.text, x.bold]), p.closing, p.caption, ...p.hashtags].join(" ");
  return POLITICAL.test(all);
}

const STOP = new Set("a o e é de da do das dos em no na nos nas um uma uns umas que para pra por com sem se seu sua seus suas você isso isto esse essa este esta mais menos muito já não sim ao aos à às como mas ou eu me meu minha te ele ela eles elas foi ser ter tem vai agora hoje".split(" "));

function words(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Quanto duas frases dizem a mesma coisa (palavras em comum sobre a menor). */
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

/** Duas lâminas contando a mesma coisa (ex.: capa e lâmina 2 com a mesma notícia em outras palavras). */
function repeats(p: PostDraft): boolean {
  const all = [p.cover, ...p.slides].map((x) => `${x.text} ${x.bold}`);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j]) >= 0.4) return true;
  return false;
}

async function writePost(program: Program, ctx: ShowContext, news: NewsItem[], used: string[], strict: boolean, repeat = false): Promise<PostDraft> {
  const [min, max] = program.slides;
  return generate(
    postSchema,
    {
      system: `Você escreve os carrosséis do Instagram de ${ctx.author.name} (@${ctx.author.handle}), dono da agência OutBox, que ensina IA para donos de pequenas e médias empresas no Brasil.
Formato tweet: cada lâmina é um parágrafo curto e direto, em primeira pessoa, como se o Felipe estivesse conversando, seguido de uma frase de impacto em negrito.
Tom: brasileiro, próximo, confiante, sem jargão, sem exagero, sem emoji nas lâminas. Use "você".
O perfil é como um programa de TV com vários quadros. O quadro de hoje é "${program.name}".
Regras de verdade: notícias, números, preços, datas e nomes só se estiverem na lista de notícias; nunca invente fatos, lançamentos ou citações. Cite a fonte no texto de forma natural ("segundo a OpenAI", "a Google anunciou").
Escolha de notícia: prefira lançamentos, recursos novos, usos práticos e avanços que ajudam empresas e pessoas. Fuja de processos, escândalos, demissões e polêmicas.
REGRA ABSOLUTA: nada político. Não cite governos, políticos, partidos, eleições, leis, regulação, tarifas, guerras ou disputas entre países, nem de passagem.${strict ? "\nATENÇÃO: a versão anterior saiu com assunto político e foi descartada. Escolha outra notícia e outro ângulo, 100% sobre tecnologia e negócios." : ""}
Pouco texto: quem rola o feed lê em 3 segundos. Uma ideia por lâmina, frases curtas.
Nada de repetição: a capa só fisga; a primeira lâmina de conteúdo já entrega a informação; cada lâmina avança a história; o negrito nunca repete o texto da própria lâmina.${repeat ? "\nATENÇÃO: a versão anterior repetiu a mesma informação em lâminas diferentes e foi descartada." : ""}
Sem markdown: nada de asteriscos, títulos ou rótulos. O negrito é o campo "bold", separado.
Português do Brasil correto.`,
      user: `Quadro de hoje: ${program.name}
O que o quadro faz: ${program.brief}
Quantidade de lâminas de conteúdo: ${min} a ${max} (fora a capa e o fechamento).
Frase de fechamento sugerida: ${program.closing}
Evite repetir estes posts recentes: ${used.join(" | ") || "nenhum"}
${program.news ? `\nNotícias de IA das últimas horas (use só estas):\n${newsBlock(news)}` : ""}

Escreva o carrossel.`,
    },
    { maxTokens: 6000, timeoutMs: 150_000, effort: "medium", task: "programa" },
  );
}

/** Gera um post do programa e guarda em ig_posts (source "show"). */
export async function createShowPost(input: { program?: Program; status: "draft" | "awaiting"; scheduledAt?: Date | null }): Promise<{ id: string; urls: string[]; title: string; program: Program }> {
  await loadSettings();
  const program = input.program ?? programFor(new Date());
  const ctx = await showContext();
  if (!imagesEnabled()) throw new Error("Geração de imagens desligada (Painel admin → Imagens).");

  let news: NewsItem[] = [];
  if (program.news) {
    news = await latestAiNews(48);
    if (news.length < 5) news = await latestAiNews(120);
    if (!news.length) throw new Error("Nenhuma notícia de IA encontrada nas fontes agora.");
  }
  const used = await recentTitles(ctx.clientId);
  const max = program.slides[1];

  // regra fixa: nada político. Se o texto sair político, reescreve; se insistir, troca por um quadro sem notícia.
  let out = await writePost(program, ctx, news, used, false);
  if (isPolitical(out)) out = await writePost(program, ctx, news, used, true);
  else if (repeats(out)) {
    const again = await writePost(program, ctx, news, used, false, true);
    if (!isPolitical(again) && !repeats(again)) out = again;
  }
  if (isPolitical(out)) {
    if (!program.news) throw new Error("O texto saiu com assunto político duas vezes; nada foi publicado.");
    const fallback = programById("prompt")!;
    console.warn(`[programa] ${program.name} saiu político duas vezes; trocado por ${fallback.name}`);
    return createShowPost({ ...input, program: fallback });
  }

  const slides = [out.cover, ...out.slides.slice(0, max)];
  const style = program.id === "meme" ? MEME_IMAGE_STYLE : SHOW_IMAGE_STYLE;
  const images: (string | null)[] = new Array(slides.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < slides.length) {
      const i = next++;
      try {
        const { bytes } = await generateImage({ prompt: `${slides[i].image_prompt.trim()} Generic unbranded objects only.${style}`, aspect: "16:9", size: "1K", signal: AbortSignal.timeout(150_000) });
        images[i] = await tweetImage(bytes);
      } catch (err) {
        console.error("[programa] imagem falhou:", err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const content: TweetSlide[] = [
    ...slides.map((s, i) => ({ ...slideText(s, program.name), image: images[i] })),
    { text: clean(out.closing, 140, program.name) || program.closing, bold: `Segue @${ctx.author.handle} para não perder o próximo programa.`, image: null },
  ];
  const total = content.length;
  const buffers = await Promise.all(content.map((s, i) => tweetSlide(ctx.author, program.name, s, i + 1, total)));
  const urls = await Promise.all(buffers.map((b, i) => upload(ctx.clientId, b, `programa-${program.id}-${i + 1}`)));

  const sources = out.sources.filter((u) => news.some((n) => n.link === u));
  const tags = [...new Set(out.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "").toLowerCase()).filter(Boolean))].slice(0, 12);
  const sourceLine = sources.length
    ? `\n\nFonte${sources.length > 1 ? "s" : ""}: ${sources.map((u) => news.find((n) => n.link === u)?.source ?? "").filter(Boolean).join(", ")}`
    : "";
  // a IA às vezes já põe hashtags e "Fonte:" no texto: tira para não sair repetido
  const body = out.caption
    .split("\n")
    .map((l) => l.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "").trimEnd())
    .filter((l) => !/^\s*fontes?\s*:/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const caption = `${body}${sourceLine}\n\n#${program.name.replace(/\s+/g, "")} ${tags.map((t) => `#${t}`).join(" ")}`.slice(0, 2200);
  const meta = content.map((s, i) => ({ url: urls[i], title: i === 0 ? `${program.name}: ${s.text.slice(0, 90)}` : s.text.slice(0, 90), text: s.bold ?? "" }));

  const { data, error } = await db()
    .from("ig_posts")
    .insert({
      client_id: ctx.clientId,
      kind: "carousel",
      slides: meta,
      caption,
      status: input.status,
      source: "show",
      scheduled_at: input.scheduledAt ? input.scheduledAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Não foi possível salvar o post: ${error?.message ?? "sem retorno"}`);
  return { id: (data as { id: string }).id, urls, title: meta[0].title, program };
}

// ---------- Agenda: gera 1 hora antes, manda para o veto no Telegram, publica no horário ----------

function brtParts(date: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return f; // AAAA-MM-DD
}

/** Instante do horário do programa no dia de `now` (Brasília é UTC-3). */
function slotFor(now: Date, hour: number): Date {
  return new Date(`${brtParts(now)}T${String(hour).padStart(2, "0")}:00:00-03:00`);
}

export function showSettings(): { enabled: boolean; hour: number } {
  const hour = Number(pick("show_hour") ?? "12");
  return { enabled: pick("show_enabled") === "on", hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : 12 };
}

const flag = globalThis as typeof globalThis & { __showBusy?: boolean };

/** Ciclo de 5 min: faltando até 1 hora para o horário e sem post do dia, gera e manda para o veto. */
export async function prepareShow(now = new Date()): Promise<string | null> {
  await loadSettings();
  const cfg = showSettings();
  if (!cfg.enabled || flag.__showBusy) return null;
  const slot = slotFor(now, cfg.hour);
  const opens = slot.getTime() - VETO_MINUTES * 60_000;
  if (now.getTime() < opens || now.getTime() > slot.getTime()) return null;

  const { data: existing } = await db().from("ig_posts").select("id").eq("source", "show").eq("scheduled_at", slot.toISOString()).limit(1);
  if (existing?.length) return null;

  flag.__showBusy = true;
  try {
    const post = await createShowPost({ status: "awaiting", scheduledAt: slot });
    const ctx = await showContext().catch(() => null);
    if (ctx?.chatId && telegramEnabled()) {
      await sendMediaGroup(ctx.chatId, post.urls.slice(0, 10));
      const hh = `${String(cfg.hour).padStart(2, "0")}h`;
      await sendMessage(
        ctx.chatId,
        `<b>${post.program.name}</b> de hoje vai ao ar às ${hh} sozinho.\n\nSe quiser barrar, toque em Cancelar até lá. Se estiver tudo certo, não precisa fazer nada.`,
        [
          [
            { text: "🚫 Cancelar este post", callback_data: `showno:${post.id}` },
            { text: "✅ Publicar agora", callback_data: `igok:${post.id}` },
          ],
        ],
      );
    }
    return `programa ${post.program.name} pronto para as ${cfg.hour}h`;
  } finally {
    flag.__showBusy = false;
  }
}

/** Ciclo de 60 s: publica o post do programa quando chega o horário (se não foi cancelado). */
export async function publishDueShow(now = new Date()): Promise<number> {
  const { data } = await db()
    .from("ig_posts")
    .select("id")
    .eq("source", "show")
    .eq("status", "awaiting")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now.toISOString())
    .limit(2);
  let done = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    const r = await publishIgPost(row.id);
    console.log(`[programa] ${row.id}: ${r.ok ? "publicado" : r.message}`);
    if (r.ok) done++;
  }
  return done;
}
