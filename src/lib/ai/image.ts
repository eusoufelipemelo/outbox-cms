import "server-only";
import sharp from "sharp";
import { env } from "@/lib/env";

/**
 * Geração de imagens. Com a chave da Magnific salva, tudo sai no Nano Banana 2.1 pela API da
 * Magnific (créditos da conta), e o Gemini (Interactions API do Google) fica de reserva.
 * Sem a Magnific, ou com "Só Google" no Painel admin, vai direto para o Gemini.
 * Devolve os bytes prontos para ir ao armazenamento de mídia do CMS.
 */

export const IMAGE_ASPECTS = ["16:9", "1:1", "4:5", "9:16", "4:3", "3:2"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export const IMAGE_SIZES = ["1K", "2K", "4K"] as const;

/** Modelos de imagem liberados no CMS (o padrão vem de GEMINI_IMAGE_MODEL). */
export const IMAGE_MODELS = ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];

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

export type ImageProvider = "magnific" | "gemini";

/** Quem gera as imagens agora: a Magnific quando a chave dela está salva e não foi escolhido "Só Google". */
export function imageProvider(): ImageProvider | null {
  if (env.magnificApiKey && env.imageProvider !== "gemini") return "magnific";
  if (env.geminiApiKey) return "gemini";
  return null;
}

export function imagesEnabled(): boolean {
  return imageProvider() !== null;
}

type ImageInput = {
  prompt: string;
  aspect?: ImageAspect;
  size?: ImageSize;
  /** Modelo do Gemini; na Magnific todas as imagens saem no Nano Banana 2.1. */
  model?: ImageModel;
  signal?: AbortSignal;
};

export async function generateImage(input: ImageInput): Promise<GeneratedImage> {
  const provider = imageProvider();
  if (!provider) throw new ImageError("Geração de imagens desligada: salve a chave da Magnific ou do Gemini em Painel admin → Imagens.", 503);
  if (provider === "gemini") return generateWithGemini(input);
  try {
    return await generateWithMagnific(input);
  } catch (err) {
    // cancelado por quem pediu, recusa de conteúdo ou sem reserva: não tenta o Gemini
    if (input.signal?.aborted || !env.geminiApiKey || (err instanceof ImageError && err.status === 422)) throw err;
    console.error("[imagem] Magnific falhou, usando o Gemini:", err instanceof Error ? err.message : err);
    return generateWithGemini(input);
  }
}

// ---------- Magnific: Nano Banana 2.1 (tarefa assíncrona: cria, acompanha, baixa) ----------

const MAGNIFIC_ENDPOINT = "https://api.magnific.com/v1/ai/text-to-image/nano-banana-2-1";

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

function magnificError(status: number, body: string): ImageError {
  console.error("[imagem] Magnific HTTP", status, body.slice(0, 300));
  if (status === 400 && /safety|blocked|policy|moderat|nsfw|inappropriate/i.test(body)) {
    return new ImageError("A Magnific recusou este pedido. Reescreva a descrição sem pessoas reais, marcas ou conteúdo sensível.", 422);
  }
  if (status === 401 || status === 403) return new ImageError("Chave da Magnific inválida ou desativada. Confira a chave em Painel admin → Imagens.", 401);
  if (status === 402 || /credit|insufficient|balance/i.test(body)) return new ImageError("A conta da Magnific ficou sem créditos para a API. Confira o saldo na Magnific.", 402);
  if (status === 429) return new ImageError("Limite de pedidos da Magnific atingido. Espere um pouco e tente de novo.", 429);
  return new ImageError("A Magnific não conseguiu gerar a imagem agora. Tente de novo.");
}

async function generateWithMagnific(input: ImageInput): Promise<GeneratedImage> {
  const key = env.magnificApiKey;
  if (!key) throw new ImageError("Chave da Magnific não configurada.", 503);
  const signal = input.signal ?? AbortSignal.timeout(240_000);
  const headers = { "x-magnific-api-key": key, "content-type": "application/json", accept: "application/json" };

  let res: Response;
  try {
    res = await fetch(MAGNIFIC_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: input.prompt.slice(0, 12_000), aspect_ratio: input.aspect ?? "16:9", resolution: input.size ?? "2K" }),
      signal,
      cache: "no-store",
    });
  } catch {
    if (signal.aborted) throw new ImageError("A geração da imagem foi cancelada ou demorou demais.", 504);
    throw new ImageError("Não foi possível falar com a Magnific agora. Tente de novo em instantes.");
  }
  if (!res.ok) throw magnificError(res.status, await res.text().catch(() => ""));

  type Task = { data?: { task_id?: string; status?: string; generated?: string[] } };
  let task = ((await res.json().catch(() => null)) as Task | null)?.data;
  const taskId = task?.task_id;
  if (!taskId) throw new ImageError("A Magnific não devolveu a tarefa da imagem. Tente de novo.");

  // acompanha a tarefa: costuma ficar pronta em 10 a 40 segundos
  for (let attempt = 0; task?.status !== "COMPLETED"; attempt++) {
    if (task?.status === "FAILED") throw new ImageError("A Magnific não conseguiu gerar esta imagem. Tente de novo com outra descrição.");
    if (attempt > 75) throw new ImageError("A Magnific demorou demais para gerar a imagem. Tente de novo.", 504);
    try {
      await wait(attempt < 5 ? 2_000 : 4_000, signal);
      const poll = await fetch(`${MAGNIFIC_ENDPOINT}/${taskId}`, { headers, signal, cache: "no-store" });
      if (!poll.ok) {
        if (poll.status >= 500 || poll.status === 429) continue; // instabilidade passageira: tenta de novo
        throw magnificError(poll.status, await poll.text().catch(() => ""));
      }
      task = ((await poll.json().catch(() => null)) as Task | null)?.data;
    } catch (err) {
      if (err instanceof ImageError) throw err;
      if (signal.aborted) throw new ImageError("A Magnific demorou demais para gerar a imagem. Tente de novo.", 504);
    }
  }

  const url = task.generated?.find((u) => typeof u === "string" && u.startsWith("https://"));
  if (!url) throw new ImageError("A Magnific terminou sem imagem. Tente de novo com outra descrição.");
  const file = await fetch(url, { signal, cache: "no-store" }).catch(() => null);
  if (!file?.ok) throw new ImageError("Não foi possível baixar a imagem da Magnific. Tente de novo.");
  // mesmo formato que o Gemini entrega (JPEG), para capas e lâminas leves
  const jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return { bytes: new Uint8Array(jpeg), mime: "image/jpeg" };
}

// ---------- Google: Gemini (Nano Banana) pela Interactions API ----------

async function generateWithGemini(input: ImageInput): Promise<GeneratedImage> {
  const key = env.geminiApiKey;
  if (!key) throw new ImageError("Geração de imagens desligada: configure GEMINI_API_KEY nas variáveis do Easypanel.", 503);

  let res: Response;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model ?? env.geminiImageModel,
        input: [{ type: "text", text: input.prompt }],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: input.aspect ?? "16:9",
          image_size: input.size ?? "2K",
        },
      }),
      // o Pro em 4K demora mais
      signal: input.signal ?? AbortSignal.timeout(240_000),
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
    if (res.status === 403 && /denied access/i.test(body)) {
      throw new ImageError("O Google bloqueou o projeto da chave do Gemini (acesso negado). Veja o aviso no e-mail da conta Google ou troque a chave em Painel admin → Imagens.", 403);
    }
    if (res.status === 401 || res.status === 403) throw new ImageError("Chave do Gemini inválida ou sem permissão. Confira a chave em Painel admin → Imagens.", 401);
    if (res.status === 429 && /spending cap/i.test(body)) {
      throw new ImageError("O projeto da chave do Gemini atingiu o teto de gastos do mês. Aumente o limite em AI Studio → Billing (Project spend cap) ou troque a chave em Painel admin → Imagens.", 429);
    }
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
