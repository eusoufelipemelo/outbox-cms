import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Leituras ao vivo por site. O painel chama de 15 em 15 segundos.
 * "Lendo agora" = visitantes distintos com sinal nos últimos 3 minutos (o site manda um sinal por minuto).
 */
const NOW_MS = 3 * 60 * 1000;
const WINDOW_MIN = 30;
const KEEP_DAYS = 7;

type Row = { at: string; site_id: string; post_id: string | null; visitor: string };

let lastCleanup = 0;

export async function GET() {
  await requireUser();
  const now = Date.now();
  const since = new Date(now - WINDOW_MIN * 60_000).toISOString();

  const [readsRes, sitesRes] = await Promise.all([
    db().from("reads").select("at, site_id, post_id, visitor").gte("at", since).order("at", { ascending: true }).limit(20000),
    db().from("sites").select("id, name, url, client:clients(name, brand_color)").eq("status", "active"),
  ]);
  if (readsRes.error) return Response.json({ error: "Não foi possível carregar as leituras ao vivo." }, { status: 500 });

  const rows = (readsRes.data ?? []) as Row[];
  type SiteRow = { id: string; name: string; url: string; client: { name: string; brand_color: string | null } | { name: string; brand_color: string | null }[] | null };
  const sites = new Map(
    ((sitesRes.data ?? []) as SiteRow[]).map((s) => {
      const client = Array.isArray(s.client) ? s.client[0] : s.client;
      return [s.id, { id: s.id, name: client?.name || s.name, color: client?.brand_color ?? null, url: s.url }];
    }),
  );

  const perSite = new Map<string, { live: Set<string>; window: Set<string>; reads: number }>();
  const minutes = Array.from({ length: WINDOW_MIN }, () => 0);
  for (const r of rows) {
    const t = Date.parse(r.at);
    const bucket = WINDOW_MIN - 1 - Math.floor((now - t) / 60_000);
    if (bucket >= 0 && bucket < WINDOW_MIN) minutes[bucket] += 1;
    const cur = perSite.get(r.site_id) ?? { live: new Set<string>(), window: new Set<string>(), reads: 0 };
    cur.window.add(r.visitor);
    cur.reads += 1;
    if (now - t <= NOW_MS) cur.live.add(r.visitor);
    perSite.set(r.site_id, cur);
  }

  const list = [...perSite.entries()]
    .map(([siteId, v]) => ({
      siteId,
      name: sites.get(siteId)?.name ?? "Site removido",
      color: sites.get(siteId)?.color ?? null,
      now: v.live.size,
      visitors: v.window.size,
      reads: v.reads,
    }))
    .sort((a, b) => b.now - a.now || b.visitors - a.visitors || a.name.localeCompare(b.name, "pt-BR"));

  // limpeza leve: mantém 7 dias de sinais
  if (now - lastCleanup > 30 * 60_000) {
    lastCleanup = now;
    void db()
      .from("reads")
      .delete()
      .lt("at", new Date(now - KEEP_DAYS * 86_400_000).toISOString())
      .then(({ error }) => error && console.error("[ao-vivo] limpeza:", error.message));
  }

  return Response.json(
    { now: list.reduce((s, x) => s + x.now, 0), visitors: list.reduce((s, x) => s + x.visitors, 0), sites: list, minutes, windowMin: WINDOW_MIN },
    { headers: { "cache-control": "no-store" } },
  );
}
