import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { generate } from "@/lib/ai/server";
import { plainText } from "@/lib/ai/sanitize";
import { putImage } from "@/lib/storage";
import { coverSlide, contentSlide, ctaSlide, photoData, storyFrame, type Brand } from "./art";
import { igAccount } from "./oauth";
import { publishCarousel, publishStory } from "./api";

/** Carrossel + legenda + story a partir de um artigo, e a publicação desses rascunhos. */

const draftSchema = z.object({
  cover_title: z.string().describe("Título da capa do carrossel, até 70 caracteres, que dê vontade de arrastar."),
  slides: z
    .array(z.object({ title: z.string().describe("Até 45 caracteres."), text: z.string().describe("Até 200 caracteres, uma ideia por lâmina.") }))
    .describe("3 a 5 lâminas com os pontos principais do artigo, em ordem."),
  closing: z.string().describe("Frase final curta (até 50 caracteres) para a lâmina de chamada."),
  caption: z.string().describe("Legenda em português do Brasil, 600 a 1500 caracteres, parágrafos curtos, termina com chamada para o link da bio. Sem hashtags aqui."),
  hashtags: z.array(z.string()).describe("8 a 15 hashtags relevantes, sem #, misturando nicho e cidade quando houver."),
  story_title: z.string().describe("Título do story, até 60 caracteres."),
});

export const host = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export async function upload(clientId: string, buf: Buffer, name: string): Promise<string> {
  const { url } = await putImage(`instagram/${clientId}/${crypto.randomUUID()}-${name}.jpg`, new Uint8Array(buf), "image/jpeg");
  return url;
}

/** Cria os rascunhos (carrossel e story) de um artigo já no ar. Devolve os ids em ig_posts. */
export async function draftFromArticle(
  postId: string,
  clientId: string,
  formats: string[] = ["carousel", "story"],
): Promise<{ carouselId: string | null; storyId: string | null }> {
  const [{ data: post }, { data: client }, { data: site }, account] = await Promise.all([
    db().from("posts").select("title, excerpt, answer_summary, key_takeaways, content_html, cover_image_url").eq("id", postId).maybeSingle(),
    db().from("clients").select("name, segment, city, tone_of_voice, brand_color, image_mood").eq("id", clientId).maybeSingle(),
    db().from("sites").select("url").eq("client_id", clientId).eq("status", "active").limit(1).maybeSingle(),
    igAccount(clientId),
  ]);
  if (!post) throw new Error("Artigo não encontrado.");
  const p = post as { title: string; excerpt: string | null; answer_summary: string | null; key_takeaways: string[] | null; content_html: string; cover_image_url: string | null };
  const c = (client ?? {}) as { name?: string; segment?: string | null; city?: string | null; tone_of_voice?: string | null; brand_color?: string | null; image_mood?: string };

  const out = await generate(
    draftSchema,
    {
      system: `Você é social media da agência OutBox e transforma artigos de blog em carrossel de Instagram para ${c.name ?? "o cliente"}${c.segment ? ` (${c.segment})` : ""}.
${c.tone_of_voice ? `Tom de voz: ${c.tone_of_voice}.` : "Tom próximo, claro e profissional."}
Regras: nada de promessas exageradas, nada inventado além do artigo, sem emojis em excesso (no máximo 2 na legenda), português do Brasil. Links não são clicáveis na legenda: mande para o link da bio.`,
      user: `Artigo: "${p.title}"
Resumo: ${plainText(p.answer_summary ?? p.excerpt ?? "")}
Pontos-chave: ${(p.key_takeaways ?? []).join(" | ")}
Trecho: ${plainText(p.content_html).slice(0, 3500)}
${c.city ? `Cidade do cliente: ${c.city}` : ""}

Monte o carrossel, a legenda, as hashtags e o story.`,
    },
    { maxTokens: 4000, timeoutMs: 120_000, effort: "low", task: "apoio" },
  );

  const brand: Brand = {
    name: c.name ?? "",
    handle: account?.username ?? null,
    site: host((site as { url: string } | null)?.url),
    color: c.brand_color && /^#[0-9a-f]{6}$/i.test(c.brand_color) ? c.brand_color : "#F15532",
    dark: c.image_mood !== "claro",
  };
  const photo = await photoData(p.cover_image_url);
  const slides = out.slides.slice(0, 5);
  const total = slides.length;

  const wantCarousel = formats.includes("carousel");
  const wantStory = formats.includes("story");
  const images = wantCarousel
    ? await Promise.all([
        coverSlide(brand, out.cover_title || p.title, photo),
        ...slides.map((s, i) => contentSlide(brand, s, i + 1, total)),
        ctaSlide(brand, out.closing || "Quer saber mais?"),
      ])
    : [];
  const urls = await Promise.all(images.map((buf, i) => upload(clientId, buf, `slide-${i + 1}`)));
  const storyUrl = wantStory ? await upload(clientId, await storyFrame(brand, out.story_title || p.title, photo), "story") : null;

  const tags = [...new Set(out.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "").toLowerCase()).filter(Boolean))].slice(0, 15);
  const caption = `${out.caption.trim()}\n\n${tags.map((t) => `#${t}`).join(" ")}`.slice(0, 2200);

  let carouselId: string | null = null;
  let storyId: string | null = null;
  if (wantCarousel) {
    const slideMeta = [
      { url: urls[0], title: out.cover_title || p.title, text: "" },
      ...slides.map((s, i) => ({ url: urls[i + 1], title: s.title, text: s.text })),
      { url: urls[urls.length - 1], title: out.closing, text: "" },
    ];
    const { data, error } = await db()
      .from("ig_posts")
      .insert({ client_id: clientId, post_id: postId, kind: "carousel", slides: slideMeta, caption, status: "draft", source: "article" })
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível salvar o carrossel.");
    carouselId = data.id as string;
  }
  if (storyUrl) {
    const { data, error } = await db()
      .from("ig_posts")
      .insert({ client_id: clientId, post_id: postId, kind: "story", slides: [{ url: storyUrl, title: out.story_title, text: "" }], status: "draft", source: "article" })
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível salvar o story.");
    storyId = data.id as string;
  }
  return { carouselId, storyId };
}

/** Publica um rascunho (carrossel ou story) na conta do cliente. */
export async function publishIgPost(igPostId: string): Promise<{ ok: boolean; message: string; permalink?: string | null }> {
  const { data } = await db().from("ig_posts").select("id, client_id, kind, slides, caption, status").eq("id", igPostId).maybeSingle();
  if (!data) return { ok: false, message: "Rascunho não encontrado." };
  const row = data as { id: string; client_id: string; kind: string; slides: { url: string }[]; caption: string | null; status: string };
  if (row.status === "published") return { ok: false, message: "Este post já foi publicado." };
  const acc = await igAccount(row.client_id);
  if (!acc) return { ok: false, message: "Este cliente ainda não conectou o Instagram." };

  const { data: claimed } = await db().from("ig_posts").update({ status: "publishing", error: null }).eq("id", row.id).neq("status", "publishing").select("id");
  if (!claimed?.length) return { ok: false, message: "Este post já está sendo publicado." };
  try {
    const urls = row.slides.map((s) => s.url);
    const r = row.kind === "story" ? await publishStory(acc, urls[0]) : await publishCarousel(acc, urls, row.caption ?? "");
    await db().from("ig_posts").update({ status: "published", ig_media_id: r.id, permalink: r.permalink, published_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true, message: row.kind === "story" ? "Story publicado" : "Post publicado no Instagram", permalink: r.permalink };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao publicar no Instagram.";
    await db().from("ig_posts").update({ status: "failed", error: message.slice(0, 500) }).eq("id", row.id);
    return { ok: false, message };
  }
}
