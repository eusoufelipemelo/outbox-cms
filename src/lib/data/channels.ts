import "server-only";
import { db } from "@/lib/supabase/admin";
import { addDays, dayKey, todayKey } from "@/components/agenda/dates";
import type { Period } from "./analytics";

/** Visão de cima dos três canais: Blog, Google Empresas e Instagram, no mesmo período do painel. */

export type ChannelKey = "blog" | "google" | "instagram";
export type ChannelStat = { value: number; previous: number; trend: number[] };
export type ChannelBucket = { key: string; label: string; blog: number; google: number; instagram: number };

export type Channels = {
  stats: Record<ChannelKey, ChannelStat>;
  series: ChannelBucket[];
  queue: { blog: number; instagram: number; changes: number };
  reach: { sites: number; gbpProfiles: number; igAccounts: number };
  packages: { completo: number; blog: number; instagram: number; nenhum: number };
  failures: { google: number; instagram: number };
};

const short = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const label = (k: string) => short.format(new Date(`${k}T12:00:00Z`)).replace(/\./g, "");

export async function getChannels(period: Period, clientId?: string): Promise<Channels> {
  const today = todayKey();
  const start = addDays(today, -period + 1);
  const prevStart = addDays(start, -period);
  const since = `${prevStart}T00:00:00-03:00`;

  // sites e perfis do cliente filtrado
  let siteIds: string[] | null = null;
  let locationIds: string[] | null = null;
  if (clientId) {
    const [{ data: s }, { data: l }] = await Promise.all([
      db().from("sites").select("id").eq("client_id", clientId),
      db().from("gbp_locations").select("id").eq("client_id", clientId),
    ]);
    siteIds = ((s ?? []) as { id: string }[]).map((x) => x.id);
    locationIds = ((l ?? []) as { id: string }[]).map((x) => x.id);
  }
  const none = ["00000000-0000-0000-0000-000000000000"];

  let blogQ = db().from("post_sites").select("published_at").eq("status", "published").gte("published_at", since).limit(20000);
  if (siteIds) blogQ = blogQ.in("site_id", siteIds.length ? siteIds : none);
  let gbpQ = db().from("gbp_posts").select("created_at, status").gte("created_at", since).limit(20000);
  if (locationIds) gbpQ = gbpQ.in("location_id", locationIds.length ? locationIds : none);
  let igQ = db().from("ig_posts").select("published_at, created_at, status").gte("created_at", since).limit(20000);
  if (clientId) igQ = igQ.eq("client_id", clientId);

  let runsQ = db().from("automation_runs").select("id", { count: "exact", head: true }).eq("status", "awaiting");
  if (clientId) runsQ = runsQ.eq("client_id", clientId);
  let igWaitQ = db().from("ig_posts").select("status").in("status", ["awaiting", "changes"]);
  if (clientId) igWaitQ = igWaitQ.eq("client_id", clientId);
  let changesQ = db().from("automation_runs").select("id", { count: "exact", head: true }).eq("status", "changes");
  if (clientId) changesQ = changesQ.eq("client_id", clientId);

  let clientsQ = db().from("clients").select("id, svc_blog_gbp, svc_instagram").neq("status", "archived");
  if (clientId) clientsQ = clientsQ.eq("id", clientId);
  let sitesQ = db().from("sites").select("id", { count: "exact", head: true }).eq("status", "active");
  if (clientId) sitesQ = sitesQ.eq("client_id", clientId);
  let gbpLocQ = db().from("gbp_locations").select("id", { count: "exact", head: true }).not("client_id", "is", null);
  if (clientId) gbpLocQ = gbpLocQ.eq("client_id", clientId);
  let igAccQ = db().from("ig_accounts").select("id", { count: "exact", head: true });
  if (clientId) igAccQ = igAccQ.eq("client_id", clientId);

  const [blog, gbp, ig, runs, igWait, changes, clients, sites, gbpLoc, igAcc] = await Promise.all([blogQ, gbpQ, igQ, runsQ, igWaitQ, changesQ, clientsQ, sitesQ, gbpLocQ, igAccQ]);

  const days = Array.from({ length: period }, (_, i) => addDays(start, i));
  const prevDays = new Set(Array.from({ length: period }, (_, i) => addDays(prevStart, i)));
  const perDay: Record<ChannelKey, Map<string, number>> = { blog: new Map(), google: new Map(), instagram: new Map() };
  const prev: Record<ChannelKey, number> = { blog: 0, google: 0, instagram: 0 };
  const fail = { google: 0, instagram: 0 };
  const bump = (ch: ChannelKey, iso: string | null) => {
    if (!iso) return;
    const k = dayKey(iso);
    if (k >= start) perDay[ch].set(k, (perDay[ch].get(k) ?? 0) + 1);
    else if (prevDays.has(k)) prev[ch]++;
  };
  for (const r of (blog.data ?? []) as { published_at: string | null }[]) bump("blog", r.published_at);
  for (const r of (gbp.data ?? []) as { created_at: string; status: string }[]) {
    if (r.status === "sent") bump("google", r.created_at);
    else if (dayKey(r.created_at) >= start) fail.google++;
  }
  for (const r of (ig.data ?? []) as { published_at: string | null; created_at: string; status: string }[]) {
    if (r.status === "published") bump("instagram", r.published_at ?? r.created_at);
    else if (r.status === "failed" && dayKey(r.created_at) >= start) fail.instagram++;
  }

  const sum = (ch: ChannelKey) => days.reduce((t, d) => t + (perDay[ch].get(d) ?? 0), 0);
  const trend = (ch: ChannelKey) => {
    const size = Math.max(1, Math.ceil(days.length / 12));
    const out: number[] = [];
    for (let i = 0; i < days.length; i += size) out.push(days.slice(i, i + size).reduce((t, d) => t + (perDay[ch].get(d) ?? 0), 0));
    return out;
  };

  // colunas: por dia (7/30) ou por semana (90)
  const series: ChannelBucket[] = [];
  const step = period === 90 ? 7 : 1;
  for (let i = 0; i < days.length; i += step) {
    const slice = days.slice(i, i + step);
    const count = (ch: ChannelKey) => slice.reduce((t, d) => t + (perDay[ch].get(d) ?? 0), 0);
    series.push({ key: slice[0], label: step === 7 ? `semana de ${label(slice[0])}` : label(slice[0]), blog: count("blog"), google: count("google"), instagram: count("instagram") });
  }

  const packages = { completo: 0, blog: 0, instagram: 0, nenhum: 0 };
  for (const c of (clients.data ?? []) as { svc_blog_gbp: boolean; svc_instagram: boolean }[]) {
    if (c.svc_blog_gbp && c.svc_instagram) packages.completo++;
    else if (c.svc_blog_gbp) packages.blog++;
    else if (c.svc_instagram) packages.instagram++;
    else packages.nenhum++;
  }
  const igWaiting = ((igWait.data ?? []) as { status: string }[]).filter((r) => r.status === "awaiting").length;
  const igChanges = ((igWait.data ?? []) as { status: string }[]).filter((r) => r.status === "changes").length;

  return {
    stats: {
      blog: { value: sum("blog"), previous: prev.blog, trend: trend("blog") },
      google: { value: sum("google"), previous: prev.google, trend: trend("google") },
      instagram: { value: sum("instagram"), previous: prev.instagram, trend: trend("instagram") },
    },
    series,
    queue: { blog: runs.count ?? 0, instagram: igWaiting, changes: (changes.count ?? 0) + igChanges },
    reach: { sites: sites.count ?? 0, gbpProfiles: gbpLoc.count ?? 0, igAccounts: igAcc.count ?? 0 },
    packages,
    failures: fail,
  };
}
