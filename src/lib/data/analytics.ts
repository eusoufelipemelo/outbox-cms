import "server-only";
import { db } from "@/lib/supabase/admin";
import { addDays, dayKey, todayKey } from "@/components/agenda/dates";

/** Períodos do filtro do painel, em dias. */
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function toPeriod(value: unknown): Period {
  const n = Number(value);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

export type Point = { key: string; label: string; value: number };

export type Kpi = { value: number; previous: number; trend: number[] };

export type Analytics = {
  period: Period;
  /** Rótulo do período anterior usado nas comparações ("30 dias anteriores"). */
  previousLabel: string;
  published: Kpi;
  views: Kpi;
  deliveries: { ok: number; total: number; previousOk: number; previousTotal: number };
  /** Artigos no ar por dia (7/30 dias) ou por semana (90 dias). */
  publishedSeries: Point[];
  publishedBucket: "day" | "week";
  /** Leituras por dia no período. */
  viewsSeries: Point[];
  /** Artigos no ar por cliente no período (maiores primeiro). */
  byClient: { id: string; name: string; value: number }[];
};

const shortDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

function labelFor(key: string): string {
  return shortDay.format(new Date(`${key}T12:00:00Z`)).replace(/\./g, "");
}

/** Chaves de dia do período, do mais antigo ao mais novo (inclui hoje). */
function dayKeys(days: number, end = todayKey()): string[] {
  return Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
}

type PubRow = { published_at: string | null; site: { client_id: string; client: { id: string; name: string } | null } | null };
type ViewRow = { day: string; views: number; site_id: string };
type DeliveryRow = { ok: boolean; created_at: string; site_id: string | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function getAnalytics(period: Period, clientId?: string): Promise<Analytics> {
  const today = todayKey();
  const start = addDays(today, -period + 1);
  const prevStart = addDays(start, -period);
  const since = `${prevStart}T00:00:00-03:00`;

  // Sites do cliente filtrado (para leituras e entregas, que só têm site_id)
  let siteIds: string[] | null = null;
  if (clientId) {
    const { data } = await db().from("sites").select("id").eq("client_id", clientId);
    siteIds = (data ?? []).map((s: { id: string }) => s.id);
  }

  const pubsQuery = db()
    .from("post_sites")
    .select("published_at, site:sites!inner(client_id, client:clients(id, name))")
    .eq("status", "published")
    .gte("published_at", since)
    .limit(10000);
  const viewsQuery = db().from("post_views").select("day, views, site_id").gte("day", prevStart).limit(20000);
  const deliveriesQuery = db()
    .from("deliveries")
    .select("ok, created_at, site_id")
    .in("event", ["publish", "update"])
    .gte("created_at", since)
    .limit(10000);

  const [pubsRes, viewsRes, delRes] = await Promise.all([
    clientId ? pubsQuery.eq("site.client_id", clientId) : pubsQuery,
    siteIds ? viewsQuery.in("site_id", siteIds.length ? siteIds : ["00000000-0000-0000-0000-000000000000"]) : viewsQuery,
    siteIds ? deliveriesQuery.in("site_id", siteIds.length ? siteIds : ["00000000-0000-0000-0000-000000000000"]) : deliveriesQuery,
  ]);
  if (pubsRes.error) throw new Error(`Não foi possível carregar as publicações: ${pubsRes.error.message}`);

  const pubs = ((pubsRes.data ?? []) as unknown as PubRow[])
    .map((r) => ({ day: r.published_at ? dayKey(r.published_at) : "", site: one(r.site) }))
    .filter((r) => r.day);
  const views = (viewsRes.data ?? []) as ViewRow[];
  const deliveries = (delRes.data ?? []) as DeliveryRow[];

  const current = dayKeys(period, today);
  const previous = dayKeys(period, addDays(start, -1));
  const inCurrent = (d: string) => d >= start;

  // ---- publicações
  const pubPerDay = new Map<string, number>();
  for (const p of pubs) pubPerDay.set(p.day, (pubPerDay.get(p.day) ?? 0) + 1);
  const pubCur = current.reduce((s, k) => s + (pubPerDay.get(k) ?? 0), 0);
  const pubPrev = previous.reduce((s, k) => s + (pubPerDay.get(k) ?? 0), 0);

  // ---- leituras
  const viewPerDay = new Map<string, number>();
  for (const v of views) viewPerDay.set(v.day, (viewPerDay.get(v.day) ?? 0) + (v.views ?? 0));
  const viewCur = current.reduce((s, k) => s + (viewPerDay.get(k) ?? 0), 0);
  const viewPrev = previous.reduce((s, k) => s + (viewPerDay.get(k) ?? 0), 0);

  // ---- séries
  const bucket: "day" | "week" = period === 90 ? "week" : "day";
  let publishedSeries: Point[];
  if (bucket === "day") {
    publishedSeries = current.map((k) => ({ key: k, label: labelFor(k), value: pubPerDay.get(k) ?? 0 }));
  } else {
    publishedSeries = [];
    for (let i = 0; i < current.length; i += 7) {
      const slice = current.slice(i, i + 7);
      publishedSeries.push({
        key: slice[0],
        label: `semana de ${labelFor(slice[0])}`,
        value: slice.reduce((s, k) => s + (pubPerDay.get(k) ?? 0), 0),
      });
    }
  }
  const viewsSeries = current.map((k) => ({ key: k, label: labelFor(k), value: viewPerDay.get(k) ?? 0 }));

  // tendências curtas para os cartões (12 pontos)
  const trendOf = (series: Point[]) => {
    const size = Math.max(1, Math.ceil(series.length / 12));
    const out: number[] = [];
    for (let i = 0; i < series.length; i += size) out.push(series.slice(i, i + size).reduce((s, p) => s + p.value, 0));
    return out;
  };

  // ---- por cliente
  const clients = new Map<string, { id: string; name: string; value: number }>();
  for (const p of pubs) {
    if (!inCurrent(p.day)) continue;
    const c = one(p.site?.client ?? null);
    if (!c) continue;
    const cur = clients.get(c.id) ?? { id: c.id, name: c.name, value: 0 };
    cur.value += 1;
    clients.set(c.id, cur);
  }

  // ---- entregas
  const del = { ok: 0, total: 0, previousOk: 0, previousTotal: 0 };
  for (const d of deliveries) {
    const k = dayKey(d.created_at);
    if (inCurrent(k)) {
      del.total += 1;
      if (d.ok) del.ok += 1;
    } else {
      del.previousTotal += 1;
      if (d.ok) del.previousOk += 1;
    }
  }

  return {
    period,
    previousLabel: `${period} dias anteriores`,
    published: { value: pubCur, previous: pubPrev, trend: trendOf(publishedSeries) },
    views: { value: viewCur, previous: viewPrev, trend: trendOf(viewsSeries) },
    deliveries: del,
    publishedSeries,
    publishedBucket: bucket,
    viewsSeries,
    byClient: [...clients.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "pt-BR")),
  };
}
