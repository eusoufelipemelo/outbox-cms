import "server-only";
import { db } from "@/lib/supabase/admin";
import { liConfigured, liConnection, liRedirectUri } from "@/lib/linkedin/oauth";

export type LiPageRow = {
  id: string;
  org_urn: string;
  name: string;
  vanity_name: string | null;
  website: string | null;
  client_id: string | null;
  clientName: string | null;
};

const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listLiPages(): Promise<LiPageRow[]> {
  const { data } = await db().from("li_pages").select("id, org_urn, name, vanity_name, website, client_id, clients(name)").order("name");
  type Row = Omit<LiPageRow, "clientName"> & { clients: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, clientName: one(r.clients)?.name ?? null }));
}

export async function listLiPosts(limit = 20) {
  const { data } = await db()
    .from("li_posts")
    .select("id, status, error, li_urn, created_at, li_pages(name), posts(title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = {
    id: string;
    status: string;
    error: string | null;
    li_urn: string | null;
    created_at: string;
    li_pages: { name: string } | { name: string }[] | null;
    posts: { title: string } | { title: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    status: r.status,
    error: r.error,
    urn: r.li_urn,
    created_at: r.created_at,
    page: one(r.li_pages)?.name ?? "Página removida",
    article: one(r.posts)?.title ?? "Artigo removido",
  }));
}

export function liStatus() {
  const conn = liConnection();
  // aviso quando a autorização vence em menos de 15 dias
  const expiresSoon = Boolean(conn.connected && conn.expiresAt && new Date(conn.expiresAt).getTime() - Date.now() < 15 * 86_400_000);
  return { configured: liConfigured(), redirectUri: liRedirectUri(), expiresSoon, ...conn };
}
