import "server-only";
import { db } from "@/lib/supabase/admin";
import { addDays, dayKey, diffDays, startOfDay, todayKey } from "@/components/agenda/dates";

/** Estado de frescor de um site: dias desde o último artigo publicado nele. */
export type Freshness = "fresh" | "attention" | "stale" | "paused";

export const FRESH_MAX_DAYS = 14;
export const ATTENTION_MAX_DAYS = 30;
/** Semanas mostradas no ritmo de publicação de cada site. */
export const PULSE_WEEKS = 12;

export type NetworkSite = {
  id: string;
  name: string;
  url: string;
  paused: boolean;
  lastPublishedAt: string | null;
  daysSince: number | null;
  lastTitle: string | null;
  lastPostId: string | null;
  freshness: Freshness;
  /** Artigos publicados por semana, da mais antiga para a atual. */
  weeks: number[];
};

export type NetworkClient = {
  id: string;
  name: string;
  segment: string | null;
  place: string | null;
  sites: NetworkSite[];
};

export type FailureItem = {
  id: string;
  postId: string;
  postTitle: string;
  siteName: string;
  clientName: string | null;
  message: string | null;
  at: string;
};

export type UpcomingItem = { id: string; title: string; scheduledAt: string; siteNames: string[] };
export type DraftItem = { id: string; title: string; updatedAt: string; destinations: number };
export type TopReadItem = { id: string; title: string; views: number; sites: number };

export type DashboardData = {
  clientCount: number;
  siteCount: number;
  postCount: number;
  network: NetworkClient[];
  counts: Record<Exclude<Freshness, "paused">, number>;
  month: { posts: number; sites: number };
  failures: FailureItem[];
  failureTotal: number;
  upcoming: UpcomingItem[];
  drafts: DraftItem[];
  topRead: TopReadItem[];
};

export function freshnessFor(daysSince: number | null): Exclude<Freshness, "paused"> {
  if (daysSince === null || daysSince > ATTENTION_MAX_DAYS) return "stale";
  if (daysSince > FRESH_MAX_DAYS) return "attention";
  return "fresh";
}

type Rel<T> = T | T[] | null;
function one<T>(value: Rel<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** PostgREST limita cada resposta (1000 linhas por padrão); pagina até o fim. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * size, page * size + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

type ClientRow = { id: string; name: string; segment: string | null; city: string | null; state: string | null };
type SiteRow = { id: string; client_id: string; name: string; url: string; status: "active" | "paused" };
type PubRow = {
  site_id: string;
  post_id: string;
  published_at: string;
  override_title: string | null;
  post: Rel<{ title: string }>;
};

export async function getDashboard(): Promise<DashboardData> {
  const supabase = db();
  const now = new Date();
  const today = todayKey();
  const windowStartKey = addDays(today, -(PULSE_WEEKS * 7 - 1));
  const monthStart = startOfDay(`${today.slice(0, 7)}-01`);
  const viewsFrom = addDays(today, -29);

  const [clientsRes, sitesRes, postCountRes, failuresRes, upcomingRes, draftsRes, recentPubs, views] = await Promise.all([
    supabase.from("clients").select("id, name, segment, city, state").neq("status", "archived").order("name"),
    supabase.from("sites").select("id, client_id, name, url, status").order("name"),
    supabase.from("posts").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase
      .from("post_sites")
      .select("id, post_id, last_error, updated_at, site:sites(name, client:clients(name)), post:posts(title)", { count: "exact" })
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("posts")
      .select("id, title, scheduled_at, post_sites(site:sites(name))")
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .lt("scheduled_at", new Date(now.getTime() + 7 * 86_400_000).toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(12),
    supabase
      .from("posts")
      .select("id, title, updated_at, post_sites(count)")
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(5),
    fetchAll<PubRow>((from, to) =>
      supabase
        .from("post_sites")
        .select("site_id, post_id, published_at, override_title, post:posts(title)")
        .eq("status", "published")
        .gte("published_at", startOfDay(windowStartKey).toISOString())
        .order("published_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{ post_id: string; site_id: string; views: number }>((from, to) =>
      supabase.from("post_views").select("post_id, site_id, views").gte("day", viewsFrom).order("id").range(from, to),
    ),
  ]);

  for (const res of [clientsRes, sitesRes, postCountRes, failuresRes, upcomingRes, draftsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const clients = (clientsRes.data ?? []) as ClientRow[];
  const clientIds = new Set(clients.map((c) => c.id));
  const sites = ((sitesRes.data ?? []) as SiteRow[]).filter((s) => clientIds.has(s.client_id));

  // Último artigo e ritmo semanal por site (janela das últimas semanas).
  const lastBySite = new Map<string, PubRow>();
  const weeksBySite = new Map<string, number[]>();
  const monthPosts = new Set<string>();
  const monthSites = new Set<string>();
  const siteIds = new Set(sites.map((s) => s.id));
  for (const row of recentPubs) {
    if (!row.published_at || !siteIds.has(row.site_id)) continue;
    if (!lastBySite.has(row.site_id)) lastBySite.set(row.site_id, row);
    const age = diffDays(dayKey(row.published_at), today);
    const idx = PULSE_WEEKS - 1 - Math.floor(age / 7);
    if (idx >= 0 && idx < PULSE_WEEKS) {
      const weeks = weeksBySite.get(row.site_id) ?? Array<number>(PULSE_WEEKS).fill(0);
      weeks[idx] += 1;
      weeksBySite.set(row.site_id, weeks);
    }
    if (new Date(row.published_at) >= monthStart) {
      monthPosts.add(row.post_id);
      monthSites.add(row.site_id);
    }
  }

  // Sites sem publicação recente: busca só o último artigo de cada um.
  const missing = sites.filter((s) => !lastBySite.has(s.id));
  const older = await Promise.all(
    missing.map((s) =>
      supabase
        .from("post_sites")
        .select("site_id, post_id, published_at, override_title, post:posts(title)")
        .eq("site_id", s.id)
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  for (const res of older) {
    const row = res.data as PubRow | null;
    if (row) lastBySite.set(row.site_id, row);
  }

  const counts = { fresh: 0, attention: 0, stale: 0 };
  const networkSites = new Map<string, NetworkSite[]>();
  for (const s of sites) {
    const last = lastBySite.get(s.id) ?? null;
    const daysSince = last ? Math.max(0, diffDays(dayKey(last.published_at), today)) : null;
    const paused = s.status === "paused";
    const state = freshnessFor(daysSince);
    if (!paused) counts[state] += 1;
    const item: NetworkSite = {
      id: s.id,
      name: s.name,
      url: s.url,
      paused,
      lastPublishedAt: last?.published_at ?? null,
      daysSince,
      lastTitle: last ? last.override_title || one(last.post)?.title || "Sem título" : null,
      lastPostId: last?.post_id ?? null,
      freshness: paused ? "paused" : state,
      weeks: weeksBySite.get(s.id) ?? Array<number>(PULSE_WEEKS).fill(0),
    };
    const list = networkSites.get(s.client_id) ?? [];
    list.push(item);
    networkSites.set(s.client_id, list);
  }

  // Mais esquecido primeiro: nunca publicado > mais dias parado; sites pausados por último.
  const neglect = (s: NetworkSite) => (s.paused ? -2 : s.daysSince === null ? Number.MAX_SAFE_INTEGER : s.daysSince);
  const network: NetworkClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    segment: c.segment,
    place: [c.city, c.state].filter(Boolean).join("/") || null,
    sites: (networkSites.get(c.id) ?? []).sort((a, b) => neglect(b) - neglect(a)),
  }));
  const clientNeglect = (c: NetworkClient) => (c.sites.length ? Math.max(...c.sites.map(neglect)) : -3);
  network.sort((a, b) => clientNeglect(b) - clientNeglect(a) || a.name.localeCompare(b.name, "pt-BR"));

  type FailRow = {
    id: string;
    post_id: string;
    last_error: string | null;
    updated_at: string;
    site: Rel<{ name: string; client: Rel<{ name: string }> }>;
    post: Rel<{ title: string }>;
  };
  const failures: FailureItem[] = ((failuresRes.data ?? []) as FailRow[]).map((r) => {
    const site = one(r.site);
    return {
      id: r.id,
      postId: r.post_id,
      postTitle: one(r.post)?.title || "Sem título",
      siteName: site?.name ?? "Site removido",
      clientName: one(site?.client ?? null)?.name ?? null,
      message: r.last_error,
      at: r.updated_at,
    };
  });

  type UpRow = { id: string; title: string; scheduled_at: string; post_sites: { site: Rel<{ name: string }> }[] | null };
  const upcoming: UpcomingItem[] = ((upcomingRes.data ?? []) as UpRow[]).map((r) => ({
    id: r.id,
    title: r.title || "Sem título",
    scheduledAt: r.scheduled_at,
    siteNames: (r.post_sites ?? []).map((ps) => one(ps.site)?.name).filter((n): n is string => Boolean(n)),
  }));

  type DraftRow = { id: string; title: string; updated_at: string; post_sites: { count: number }[] | null };
  const drafts: DraftItem[] = ((draftsRes.data ?? []) as DraftRow[]).map((r) => ({
    id: r.id,
    title: r.title || "Sem título",
    updatedAt: r.updated_at,
    destinations: r.post_sites?.[0]?.count ?? 0,
  }));

  // Mais lidos: soma de visualizações por artigo nos últimos 30 dias.
  const byPost = new Map<string, { views: number; sites: Set<string> }>();
  for (const v of views) {
    const entry = byPost.get(v.post_id) ?? { views: 0, sites: new Set<string>() };
    entry.views += v.views;
    if (v.views > 0) entry.sites.add(v.site_id);
    byPost.set(v.post_id, entry);
  }
  const top = [...byPost.entries()]
    .filter(([, e]) => e.views > 0)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 5);
  let topRead: TopReadItem[] = [];
  if (top.length) {
    const { data } = await supabase
      .from("posts")
      .select("id, title")
      .in(
        "id",
        top.map(([id]) => id),
      );
    const titles = new Map(((data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
    topRead = top.map(([id, e]) => ({ id, title: titles.get(id) || "Sem título", views: e.views, sites: e.sites.size }));
  }

  return {
    clientCount: clients.length,
    siteCount: sites.length,
    postCount: postCountRes.count ?? 0,
    network,
    counts,
    month: { posts: monthPosts.size, sites: monthSites.size },
    failures,
    failureTotal: failuresRes.count ?? failures.length,
    upcoming,
    drafts,
    topRead,
  };
}
