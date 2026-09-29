import "server-only";
import { generateImage, imagesEnabled, type ImageModel } from "@/lib/ai/image";
import { visualDirection, type VisualClient } from "@/lib/ai/visual";
import { photoFromBytes, SLIDE_PHOTO } from "./art";

/**
 * Uma foto por lâmina do carrossel, com a identidade visual do cliente.
 * Usa o modelo Flash em 1K (barato e suficiente para o tamanho da lâmina) e gera 3 por vez.
 * Foto que falhar vira null: a lâmina sai no modo só texto, sem travar o post.
 */
export async function slidePhotos(prompts: string[], client: VisualClient): Promise<(string | null)[]> {
  if (!imagesEnabled() || !prompts.length) return prompts.map(() => null);
  const identity = visualDirection(client);
  const out: (string | null)[] = new Array(prompts.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < prompts.length) {
      const i = next++;
      const prompt = prompts[i]?.trim();
      if (!prompt) continue;
      try {
        const { bytes } = await generateImage({
          prompt: `${prompt} Editorial photography, natural composition, no text, no letters, no logos, no watermark.${identity}`,
          aspect: "16:9",
          size: "1K",
          model: "gemini-3.1-flash-image" as ImageModel,
          signal: AbortSignal.timeout(120_000),
        });
        out[i] = await photoFromBytes(bytes, SLIDE_PHOTO.width, SLIDE_PHOTO.height);
      } catch (err) {
        console.error("[instagram] foto da lâmina falhou:", err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}
