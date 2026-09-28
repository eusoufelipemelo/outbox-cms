import "server-only";
import type { IgAccount } from "./oauth";

/**
 * Publicação no Instagram (Content Publishing API): cria o contêiner de mídia, espera ficar
 * pronto e publica. Imagens precisam estar em URL pública e em JPEG.
 */

const BASE = "https://graph.instagram.com";

export class IgError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "IgError";
  }
}

async function call<T>(acc: IgAccount, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "POST"): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: acc.token });
  const url = method === "GET" ? `${BASE}/${path}?${body}` : `${BASE}/${path}`;
  const res = await fetch(url, { method, ...(method === "POST" ? { body } : {}), signal: AbortSignal.timeout(60_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || json.error) {
    const msg = json.error?.error_user_msg ?? json.error?.message ?? `HTTP ${res.status}`;
    if (json.error?.code === 190) throw new IgError("A autorização do Instagram venceu. Peça ao cliente para conectar a conta de novo.", 401);
    if (json.error?.code === 4 || json.error?.code === 9 || res.status === 429) throw new IgError("Limite de publicações do Instagram atingido. Tente mais tarde.", 429);
    throw new IgError(`Instagram: ${msg}`.slice(0, 300), res.status || 502);
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(acc: IgAccount, containerId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const r = await call<{ status_code?: string }>(acc, containerId, { fields: "status_code" }, "GET");
    if (!r.status_code || r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new IgError("O Instagram recusou a imagem (formato ou tamanho). Confira se é JPEG e tem no máximo 8 MB.", 422);
    await sleep(3000);
  }
  throw new IgError("O Instagram demorou demais para processar a imagem. Tente de novo.", 504);
}

async function publish(acc: IgAccount, creationId: string): Promise<{ id: string; permalink: string | null }> {
  await waitReady(acc, creationId);
  const r = await call<{ id: string }>(acc, `${acc.igUserId}/media_publish`, { creation_id: creationId });
  const info = await call<{ permalink?: string }>(acc, r.id, { fields: "permalink" }, "GET").catch(() => ({ permalink: undefined }));
  return { id: r.id, permalink: info.permalink ?? null };
}

/** Post de uma imagem no feed. */
export async function publishImage(acc: IgAccount, imageUrl: string, caption: string) {
  const c = await call<{ id: string }>(acc, `${acc.igUserId}/media`, { image_url: imageUrl, caption });
  return publish(acc, c.id);
}

/** Carrossel (2 a 10 imagens, todas cortadas na proporção da primeira). */
export async function publishCarousel(acc: IgAccount, imageUrls: string[], caption: string) {
  const urls = imageUrls.slice(0, 10);
  if (urls.length < 2) return publishImage(acc, urls[0], caption);
  const children: string[] = [];
  for (const url of urls) {
    const c = await call<{ id: string }>(acc, `${acc.igUserId}/media`, { image_url: url, is_carousel_item: "true" });
    await waitReady(acc, c.id);
    children.push(c.id);
  }
  const parent = await call<{ id: string }>(acc, `${acc.igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
  return publish(acc, parent.id);
}

/** Story de imagem (a API não põe figurinhas, links nem música). */
export async function publishStory(acc: IgAccount, imageUrl: string) {
  const c = await call<{ id: string }>(acc, `${acc.igUserId}/media`, { image_url: imageUrl, media_type: "STORIES" });
  return publish(acc, c.id);
}
