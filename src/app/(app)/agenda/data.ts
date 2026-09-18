import "server-only";
import { db } from "@/lib/supabase/admin";
import { dayKey, startOfDay } from "@/components/agenda/dates";
import type { AgendaPost } from "@/components/agenda/types";

type Row = {
  id: string;
  title: string;
  status: "scheduled" | "published";
  scheduled_at: string | null;
  published_at: string | null;
  post_sites: { status: string; site: { client_id: string } | { client_id: string }[] | null }[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Artigos agendados e publicados entre dois dias (chaves YYYY-MM-DD, fim exclusivo). */
export async function getAgendaPosts(fromKey: string, toKey: string, clientId?: string): Promise<AgendaPost[]> {
  const from = startOfDay(fromKey).toISOString();
  const to = startOfDay(toKey).toISOString();
  const fields = "id, title, status, scheduled_at, published_at, post_sites(status, site:sites(client_id))";
  const supabase = db();
  const [scheduled, published] = await Promise.all([
    supabase.from("posts").select(fields).eq("status", "scheduled").gte("scheduled_at", from).lt("scheduled_at", to).limit(1000),
    supabase.from("posts").select(fields).eq("status", "published").gte("published_at", from).lt("published_at", to).limit(1000),
  ]);
  if (scheduled.error) throw new Error(scheduled.error.message);
  if (published.error) throw new Error(published.error.message);

  const rows = [...((scheduled.data ?? []) as Row[]), ...((published.data ?? []) as Row[])];
  const out: AgendaPost[] = [];
  for (const r of rows) {
    const at = r.status === "scheduled" ? r.scheduled_at : r.published_at;
    if (!at) continue;
    const links = r.post_sites ?? [];
    const clientIds = links
      .map((l) => (Array.isArray(l.site) ? l.site[0] : l.site)?.client_id)
      .filter((id): id is string => Boolean(id));
    if (clientId && !clientIds.includes(clientId)) continue;
    const destinations =
      r.status === "published" ? links.filter((l) => l.status === "published").length : links.filter((l) => l.status !== "unpublished").length;
    out.push({ id: r.id, title: r.title || "Sem título", kind: r.status, at, day: dayKey(at), destinations });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export async function getClientOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db().from("clients").select("id, name").neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}
