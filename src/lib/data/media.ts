import "server-only";
import { db } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";
import type { Media } from "@/lib/types";
import { MEDIA_PAGE_SIZE } from "@/components/media/constants";

export const MEDIA_COLUMNS = "id, path, url, alt, mime, size, width, height, client_id, created_by, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Remove caracteres com significado no filtro do PostgREST. */
function cleanTerm(value: string): string {
  return value.replace(/[%_,()*\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export type MediaPage = { data: Media[]; hasMore: boolean };

export async function listMedia(opts: { q?: string | null; clientId?: string | null; page?: number; pageSize?: number } = {}): Promise<MediaPage> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? MEDIA_PAGE_SIZE, 1), 60);
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const from = page * pageSize;

  let query = db().from("media").select(MEDIA_COLUMNS);
  if (isUuid(opts.clientId)) query = query.eq("client_id", opts.clientId);

  const term = cleanTerm(opts.q ?? "");
  if (term) {
    const slug = slugify(term);
    const filters = [`alt.ilike."*${term}*"`];
    if (slug) filters.push(`path.ilike."*${slug}*"`);
    query = query.or(filters.join(","));
  }

  // uma linha a mais indica que há próxima página
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Media[];
  return { data: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function listClientsForMedia(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db().from("clients").select("id, name").neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}
