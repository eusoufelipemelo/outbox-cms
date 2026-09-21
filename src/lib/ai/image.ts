import "server-only";
import { env } from "@/lib/env";

/**
 * Geração de imagens com o Gemini (Nano Banana), pela Interactions API.
 * Devolve os bytes prontos para ir ao armazenamento de mídia do CMS.
 */

export const IMAGE_ASPECTS = ["16:9", "1:1", "4:5", "9:16", "4:3", "3:2"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export type GeneratedImage = { bytes: Uint8Array; mime: string };

export class ImageError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Procura o primeiro bloco de imagem na resposta (o formato tem variado entre versões da API). */
function findImage(node: unknown, depth = 0): { data: string; mime: string } | null {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findImage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const mime = (o.mime_type ?? o.mimeType) as string | undefined;
  const data = (o.data ?? o.bytes_base64 ?? o.bytesBase64) as string | undefined;
  if (typeof data === "string" && data.length > 256 && (!mime || mime.startsWith("image/"))) {
    return { data, mime: mime ?? "image/png" };
  }
  for (const value of Object.values(o)) {
    const found = findImage(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export function imagesEnabled(): boolean {
  return Boolean(env.geminiApiKey);
}

export async function generateImage(input: {
  prompt: string;
  aspect?: ImageAspect;
  size?: "1K" | "2K";
  signal?: AbortSignal;
}): Promise<GeneratedImage> {
  const key = env.geminiApiKey;
  if (!key) throw new ImageError("Geração de imagens desligada: configure GEMINI_API_KEY nas variáveis do Easypanel.", 503);

  let res: Response;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.geminiImageModel,
        input: [{ type: "text", text: input.prompt }],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: input.aspect ?? "16:9",
          image_size: input.size ?? "2K",
        },
      }),
      signal: input.signal ?? AbortSignal.timeout(180_000),
    });
  } catch {
    throw new ImageError("Não foi possível falar com o Gemini agora. Tente de novo em instantes.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[imagem] Gemini HTTP", res.status, body.slice(0, 300));
    if (res.status === 400 && /safety|blocked|policy/i.test(body)) {
      throw new ImageError("O Gemini recusou este pedido. Reescreva a descrição sem pessoas reais, marcas ou conteúdo sensível.", 422);
    }
    if (res.status === 401 || res.status === 403) throw new ImageError("Chave do Gemini inválida ou sem permissão. Confira GEMINI_API_KEY.", 401);
    if (res.status === 429) throw new ImageError("Limite do Gemini atingido. Espere um pouco ou confira os créditos da conta.", 429);
    throw new ImageError("O Gemini não conseguiu gerar a imagem agora. Tente de novo.");
  }

  const json: unknown = await res.json().catch(() => null);
  const found = findImage(json);
  if (!found) {
    console.error("[imagem] resposta sem imagem:", JSON.stringify(json).slice(0, 300));
    throw new ImageError("O Gemini respondeu sem imagem. Tente de novo com outra descrição.");
  }
  return { bytes: Uint8Array.from(Buffer.from(found.data, "base64")), mime: found.mime };
}
