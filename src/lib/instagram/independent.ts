import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { generate } from "@/lib/ai/server";
import { generateImage, imagesEnabled, type ImageModel } from "@/lib/ai/image";
import { visualDirection, type VisualClient } from "@/lib/ai/visual";
import { loadSettings } from "@/lib/settings";
import { nextRunAt } from "@/lib/automation/schedule";
import { sendMediaGroup, sendMessage, telegramEnabled } from "@/lib/automation/telegram";
import { coverSlide, contentSlide, ctaSlide, photoData, storyFrame, type Brand } from "./art";
import { host, publishIgPost, upload } from "./compose";
import { igAccount } from "./oauth";

/**
 * Instagram independente (cliente sem blog): o CMS cria a pauta, o carrossel, a legenda e o story
 * sem artigo por trás, no calendário do cliente, e manda para aprovação.
 */

const schema = z.object({
  topic: z.string().describe("Tema do post em uma frase."),
  cover_title: z.string().describe("Título da capa, até 70 caracteres."),
  slides: z.array(z.object({ title: z.string(), text: z.string() })).describe("3 a 5 lâminas: título até 45 caracteres e texto até 200."),
  closing: z.string().describe("Chamada final curta, até 50 caracteres."),
  caption: z.string().describe("Legenda de 500 a 1300 caracteres, parágrafos curtos, termina com chamada para ação (direct, WhatsApp ou link da bio). Sem hashtags."),
  hashtags: z.array(z.string()).describe("8 a 15 hashtags, sem #."),
  story_title: z.string().describe("Título do story, até 60 caracteres."),
  photo_prompt: z.string().describe("Cena fotográfica em inglês para a capa, sem texto na imagem."),
});

type Client = {
  name: string;
  segment: string | null;
  city: string | null;
  about: string | null;
  services: string[] | null;
  tone_of_voice: string | null;
  audience: string | null;
  ig_formats: string[] | null;
  telegram_chat_id: string | null;
} & VisualClient;

export async function createIndependentPost(clientId: string, focus?: string | null): Promise<{ ids: string[]; title: string }> {
  await loadSettings();
  const [{ data: c }, { data: recent }, account] = await Promise.all([
    db()
      .from("clients")
      .select("name, segment, city, about, services, tone_of_voice, audience, ig_formats, telegram_chat_id, brand_color, image_style, image_mood")
      .eq("id", clientId)
      .maybeSingle(),
    db().from("ig_posts").select("slides").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    igAccount(clientId),
  ]);
  if (!c) throw new Error("Cliente não encontrado.");
  const client = c as Client;
  const used = ((recent ?? []) as { slides: { title?: string }[] }[]).map((r) => r.slides?.[0]?.title).filter(Boolean);

  const out = await generate(
    schema,
    {
      system: `Você é social media da agência OutBox e cria posts de Instagram para ${client.name}${client.segment ? ` (${client.segment})` : ""}.
${client.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}.` : "Tom próximo, claro e profissional."}
Conteúdo útil para o público, que gere confiança e contato. Nada inventado sobre a empresa além do que está abaixo. Português do Brasil. No máximo 2 emojis na legenda.`,
      user: `Sobre a empresa: ${client.about ?? "não informado"}
Serviços: ${(client.services ?? []).join("; ") || "não informado"}
Público: ${client.audience ?? "não informado"}
Cidade: ${client.city ?? "não informada"}
${focus ? `Foco pedido: ${focus}` : ""}
Evite repetir estes temas recentes: ${used.join(" | ") || "nenhum"}

Crie um carrossel educativo, a legenda, as hashtags, o story e a cena da foto de capa.`,
    },
    { maxTokens: 4000, timeoutMs: 120_000, effort: "low", task: "apoio" },
  );

  // foto da capa com a identidade visual do cliente
  let photoUrl: string | null = null;
  if (imagesEnabled()) {
    try {
      const { bytes } = await generateImage({
        prompt: `${out.photo_prompt} Editorial photography, no text, no logos.${visualDirection(client)}`,
        aspect: "4:5",
        size: "2K",
        model: "gemini-3.1-flash-image" as ImageModel,
      });
      photoUrl = await upload(clientId, Buffer.from(bytes), "foto");
    } catch (err) {
      console.error("[instagram] foto da capa falhou:", err instanceof Error ? err.message : err);
    }
  }

  const { data: site } = await db().from("sites").select("url").eq("client_id", clientId).limit(1).maybeSingle();
  const brand: Brand = {
    name: client.name,
    handle: account?.username ?? null,
    site: host((site as { url: string } | null)?.url),
    color: client.brand_color && /^#[0-9a-f]{6}$/i.test(client.brand_color) ? client.brand_color : "#F15532",
    dark: client.image_mood !== "claro",
  };
  const photo = await photoData(photoUrl);
  const formats = client.ig_formats?.length ? client.ig_formats : ["carousel", "story"];
  const slides = out.slides.slice(0, 5);
  const tags = [...new Set(out.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "").toLowerCase()).filter(Boolean))].slice(0, 15);
  const caption = `${out.caption.trim()}\n\n${tags.map((t) => `#${t}`).join(" ")}`.slice(0, 2200);
  const ids: string[] = [];

  if (formats.includes("carousel")) {
    const images = await Promise.all([
      coverSlide(brand, out.cover_title, photo),
      ...slides.map((s, i) => contentSlide(brand, s, i + 1, slides.length)),
      ctaSlide(brand, out.closing || "Fale com a gente"),
    ]);
    const urls = await Promise.all(images.map((b, i) => upload(clientId, b, `slide-${i + 1}`)));
    const meta = [
      { url: urls[0], title: out.cover_title, text: "" },
      ...slides.map((s, i) => ({ url: urls[i + 1], title: s.title, text: s.text })),
      { url: urls[urls.length - 1], title: out.closing, text: "" },
    ];
    const { data } = await db()
      .from("ig_posts")
      .insert({ client_id: clientId, kind: "carousel", slides: meta, caption, status: "draft", source: "independent" })
      .select("id")
      .single();
    if (data) ids.push(data.id as string);
  }
  if (formats.includes("story")) {
    const url = await upload(clientId, await storyFrame(brand, out.story_title, photo), "story");
    const { data } = await db()
      .from("ig_posts")
      .insert({ client_id: clientId, kind: "story", slides: [{ url, title: out.story_title, text: "" }], status: "draft", source: "independent" })
      .select("id")
      .single();
    if (data) ids.push(data.id as string);
  }
  return { ids, title: out.cover_title };
}

/** Manda os rascunhos para o cliente aprovar no Telegram (fotos + botões). */
export async function sendIgForApproval(igPostIds: string[], chatId: string): Promise<void> {
  const { data } = await db().from("ig_posts").select("id, kind, slides, caption").in("id", igPostIds);
  for (const p of (data ?? []) as { id: string; kind: string; slides: { url: string; title?: string }[]; caption: string | null }[]) {
    await sendMediaGroup(chatId, p.slides.map((s) => s.url));
    const label = p.kind === "story" ? "Story" : "Post do feed (carrossel)";
    const text = `<b>${label} para o Instagram</b>\n\n${(p.caption ?? p.slides[0]?.title ?? "").slice(0, 700).replace(/&/g, "&amp;").replace(/</g, "&lt;")}\n\nSe estiver bom, toque em Aprovar e publicar.`;
    const msg = await sendMessage(chatId, text, [
      [
        { text: "✅ Aprovar e publicar", callback_data: `igok:${p.id}` },
        { text: "✏️ Pedir ajustes", callback_data: `igno:${p.id}` },
      ],
    ]);
    await db().from("ig_posts").update({ status: "awaiting", telegram_message_id: msg.message_id }).eq("id", p.id);
  }
}

type IgAutomation = { id: string; client_id: string; per_month: number; weekdays: number[]; hour: number; approval: string; focus: string | null; next_run_at: string | null };

/** Uma rodada do calendário do Instagram de um cliente. */
export async function runIgAutomation(a: IgAutomation): Promise<string> {
  const { data: c } = await db().from("clients").select("svc_instagram, svc_blog_gbp, telegram_chat_id").eq("id", a.client_id).maybeSingle();
  const client = c as { svc_instagram?: boolean; svc_blog_gbp?: boolean; telegram_chat_id?: string | null } | null;
  if (!client?.svc_instagram) throw new Error("Serviço Instagram desativado para este cliente.");
  if (client.svc_blog_gbp) throw new Error("Cliente no pacote completo: o Instagram sai dos artigos do blog, não deste calendário.");
  if (!(await igAccount(a.client_id))) throw new Error("O cliente ainda não conectou o Instagram.");

  const { ids, title } = await createIndependentPost(a.client_id, a.focus);
  if (a.approval === "auto") {
    const results = [];
    for (const id of ids) results.push(await publishIgPost(id));
    const fails = results.filter((r) => !r.ok);
    if (fails.length) throw new Error(fails.map((f) => f.message).join("; "));
    return `publicado: ${title}`;
  }
  if (a.approval === "telegram" && client.telegram_chat_id && telegramEnabled()) {
    await sendIgForApproval(ids, client.telegram_chat_id);
    return `enviado para aprovação: ${title}`;
  }
  return `rascunho criado: ${title}${a.approval === "telegram" ? " (Telegram do cliente não conectado)" : ""}`;
}

export async function processIgAutomations(): Promise<number> {
  const now = new Date();
  const { data } = await db()
    .from("ig_automations")
    .select("id, client_id, per_month, weekdays, hour, approval, focus, next_run_at")
    .eq("active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .limit(3);
  let ran = 0;
  for (const a of (data ?? []) as IgAutomation[]) {
    const next = nextRunAt({ weekdays: a.weekdays, hour: a.hour, perMonth: a.per_month }, now);
    const { data: claimed } = await db()
      .from("ig_automations")
      .update({ next_run_at: next.toISOString(), last_run_at: now.toISOString(), last_error: null })
      .eq("id", a.id)
      .eq("next_run_at", a.next_run_at)
      .select("id");
    if (!claimed?.length) continue;
    try {
      const msg = await runIgAutomation(a);
      console.log(`[instagram] ${a.client_id}: ${msg}`);
    } catch (err) {
      await db().from("ig_automations").update({ last_error: err instanceof Error ? err.message : "falha" }).eq("id", a.id);
    }
    ran++;
  }
  return ran;
}

