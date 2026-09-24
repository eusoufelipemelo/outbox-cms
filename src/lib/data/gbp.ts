import "server-only";
import { db } from "@/lib/supabase/admin";
import { googleConnection, oauthConfigured, redirectUri } from "@/lib/google/oauth";

export type GbpLocationRow = {
  id: string;
  account_name: string;
  location_name: string;
  title: string;
  address: string | null;
  website: string | null;
  maps_uri: string | null;
  client_id: string | null;
  unit_id: string | null;
  clientName: string | null;
};

export async function listGbpLocations(): Promise<GbpLocationRow[]> {
  const { data } = await db()
    .from("gbp_locations")
    .select("id, account_name, location_name, title, address, website, maps_uri, client_id, unit_id, clients(name)")
    .order("title");
  type Row = GbpLocationRow & { clients: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    clientName: (Array.isArray(r.clients) ? r.clients[0]?.name : r.clients?.name) ?? null,
  }));
}

export async function listGbpPosts(limit = 20) {
  const { data } = await db()
    .from("gbp_posts")
    .select("id, status, error, created_at, gbp_locations(title), posts(title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = { id: string; status: string; error: string | null; created_at: string; gbp_locations: { title: string } | { title: string }[] | null; posts: { title: string } | { title: string }[] | null };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    status: r.status,
    error: r.error,
    created_at: r.created_at,
    location: one(r.gbp_locations)?.title ?? "Perfil removido",
    article: one(r.posts)?.title ?? "Artigo removido",
  }));
}

export function gbpStatus() {
  return { configured: oauthConfigured(), redirectUri: redirectUri(), ...googleConnection() };
}
