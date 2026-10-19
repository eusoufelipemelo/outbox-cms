import "server-only";
import { db } from "@/lib/supabase/admin";
import { generateImage, imagesEnabled, type ImageModel } from "@/lib/ai/image";
import { visualDirection, type VisualClient } from "@/lib/ai/visual";
import { loadSettings } from "@/lib/settings";
import { telegramEnabled } from "@/lib/automation/telegram";
import { coverSlide, contentSlide, ctaSlide, photoData, photoFromBytes, storyFrame, type Brand } from "./art";
import { host, upload } from "./compose";
import { sendIgForApproval } from "./independent";
import { slidePhotos } from "./photos";
import { igAccount } from "./oauth";

type Slide = { url: string; title?: string; text?: string };
type Row = { id: string; client_id: string; post_id: string | null; kind: string; slides: Slide[]; status: string; created_at: string };

/**
 * Refaz as fotos de um post do Instagram que saiu só com texto (ex.: a geração de imagem falhou),
 * mantendo títulos, textos e legenda. O carrossel e o story criados juntos são refeitos juntos,
 * com a mesma foto de capa, e voltam para aprovação no Telegram quando o cliente usa.
 */
export async function rebuildWithPhotos(igPostId: string): Promise<{ ids: string[]; sent: boolean }> {
  await loadSettings();
  if (!imagesEnabled()) throw new Error("Geração de imagens desligada: configure a chave do Gemini no Painel admin.");
  const { data } = await db().from("ig_posts").select("id, client_id, post_id, kind, slides, status, created_at").eq("id", igPostId).maybeSingle();
  const first = data as Row | null;
  if (!first) throw new Error("Post não encontrado.");
  if (first.status === "published") throw new Error("Este post já foi publicado.");

  // o par (carrossel + story) nasce no mesmo minuto
  const t = new Date(first.created_at).getTime();
  const { data: siblings } = await db()
    .from("ig_posts")
    .select("id, client_id, post_id, kind, slides, status, created_at")
    .eq("client_id", first.client_id)
    .neq("status", "published")
    .gte("created_at", new Date(t - 60_000).toISOString())
    .lte("created_at", new Date(t + 60_000).toISOString());
  const rows = ((siblings ?? []) as Row[]).filter((r) => r.id === first.id || r.kind !== first.kind);

  const [{ data: c }, { data: site }, account] = await Promise.all([
    db().from("clients").select("name, segment, brand_color, image_mood, image_style, telegram_chat_id").eq("id", first.client_id).maybeSingle(),
    db().from("sites").select("url").eq("client_id", first.client_id).limit(1).maybeSingle(),
    igAccount(first.client_id),
  ]);
  const client = (c ?? { name: "" }) as { name: string; segment: string | null; brand_color: string | null; telegram_chat_id: string | null } & VisualClient;
  const brand: Brand = {
    name: client.name,
    handle: account?.username ?? null,
    site: host((site as { url: string } | null)?.url),
    color: client.brand_color && /^#[0-9a-f]{6}$/i.test(client.brand_color) ? client.brand_color : "#F15532",
    dark: client.image_mood !== "claro",
  };
  const topic = first.slides[0]?.title ?? "";
  const niche = client.segment ? ` for a ${client.segment} business` : "";

  // capa: a do artigo quando houver; senão uma foto nova do tema
  let cover: string | null = null;
  if (first.post_id) {
    const { data: post } = await db().from("posts").select("cover_image_url").eq("id", first.post_id).maybeSingle();
    cover = await photoData((post as { cover_image_url: string | null } | null)?.cover_image_url ?? null);
  }
  if (!cover) {
    const { bytes } = await generateImage({
      prompt: `Editorial photograph that illustrates the theme "${topic}"${niche}. Natural composition, no text, no letters, no logos, no watermark.${visualDirection(client)}`,
      aspect: "4:5",
      size: "1K",
      model: "gemini-3.1-flash-image" as ImageModel,
      signal: AbortSignal.timeout(120_000),
    });
    cover = await photoFromBytes(bytes, 1080, 1920);
  }

  for (const row of rows) {
    let slides: Slide[];
    if (row.kind === "story") {
      const url = await upload(row.client_id, await storyFrame(brand, row.slides[0]?.title ?? topic, cover), "story");
      slides = [{ ...row.slides[0], url }];
    } else {
      const middle = row.slides.slice(1, -1);
      const photos = await slidePhotos(
        middle.map((s) => `Editorial photograph that illustrates: ${s.title ?? ""}. ${s.text ?? ""}${niche}.`),
        client,
      );
      const closing = row.slides[row.slides.length - 1];
      const images = await Promise.all([
        coverSlide(brand, row.slides[0]?.title ?? topic, cover),
        ...middle.map((s, i) => contentSlide(brand, { title: s.title ?? "", text: s.text ?? "" }, i + 1, middle.length, photos[i])),
        ctaSlide(brand, closing?.title || "Fale com a gente"),
      ]);
      const urls = await Promise.all(images.map((b, i) => upload(row.client_id, b, `slide-${i + 1}`)));
      slides = row.slides.map((s, i) => ({ ...s, url: urls[i] }));
    }
    await db().from("ig_posts").update({ slides, status: "draft", feedback: null, error: null }).eq("id", row.id);
  }

  const ids = rows.map((r) => r.id);
  if (client.telegram_chat_id && telegramEnabled()) {
    await sendIgForApproval(ids, client.telegram_chat_id);
    return { ids, sent: true };
  }
  return { ids, sent: false };
}
