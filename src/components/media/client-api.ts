import type { Media } from "@/lib/types";

export type MediaPageResult = { data: Media[]; hasMore: boolean };

export function mergeMedia(current: Media[], incoming: Media[]) {
  const seen = new Set(current.map((m) => m.id));
  return [...current, ...incoming.filter((m) => !seen.has(m.id))];
}

/** GET /api/media (busca paginada da biblioteca). */
export async function fetchMediaPage(params: { q?: string; clientId?: string | null; page: number }): Promise<MediaPageResult> {
  const qs = new URLSearchParams({ page: String(params.page) });
  if (params.q) qs.set("q", params.q);
  if (params.clientId) qs.set("client_id", params.clientId);
  const res = await fetch(`/api/media?${qs}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (MediaPageResult & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error || "Não foi possível carregar as imagens. Tente de novo.");
  return body;
}
