import "server-only";
import { env } from "@/lib/env";

/** Notas do Google Lighthouse (PageSpeed Insights) para celular e computador. */

export type Strategy = "mobile" | "desktop";

export type PageSpeedResult = {
  strategy: Strategy;
  ok: boolean;
  error?: string;
  scores: { performance: number | null; seo: number | null; accessibility: number | null; bestPractices: number | null };
  metrics: { label: string; value: string; good: boolean | null }[];
  /** Dados de usuários reais (Chrome UX Report), quando o site tem tráfego suficiente. */
  field: { label: string; value: string; category: string }[];
  opportunities: { title: string; saving: string | null }[];
  failedSeo: string[];
};

type Audit = { title?: string; score?: number | null; displayValue?: string; numericValue?: number; details?: { type?: string } };

const METRICS: { id: string; label: string; good: (v: number) => boolean }[] = [
  { id: "largest-contentful-paint", label: "Maior elemento visível (LCP)", good: (v) => v <= 2500 },
  { id: "cumulative-layout-shift", label: "Estabilidade do layout (CLS)", good: (v) => v <= 0.1 },
  { id: "total-blocking-time", label: "Tempo bloqueado (TBT)", good: (v) => v <= 200 },
  { id: "first-contentful-paint", label: "Primeiro conteúdo (FCP)", good: (v) => v <= 1800 },
  { id: "speed-index", label: "Índice de velocidade", good: (v) => v <= 3400 },
];

const FIELD: Record<string, string> = {
  LARGEST_CONTENTFUL_PAINT_MS: "LCP de usuários reais",
  INTERACTION_TO_NEXT_PAINT: "Resposta ao toque (INP)",
  CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS de usuários reais",
};

function pct(v: unknown): number | null {
  return typeof v === "number" ? Math.round(v * 100) : null;
}

export async function runPageSpeed(url: string, strategy: Strategy): Promise<PageSpeedResult> {
  const empty: PageSpeedResult = {
    strategy,
    ok: false,
    scores: { performance: null, seo: null, accessibility: null, bestPractices: null },
    metrics: [],
    field: [],
    opportunities: [],
    failedSeo: [],
  };
  const q = new URLSearchParams({ url, strategy, locale: "pt_BR" });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) q.append("category", c);
  if (env.googleApiKey) q.set("key", env.googleApiKey);

  let json: Record<string, unknown>;
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(120_000) });
    json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg = ((json.error as { message?: string } | undefined)?.message ?? "").slice(0, 200);
      if (/are blocked|API_KEY_SERVICE_BLOCKED|has not been used|is disabled/i.test(msg)) {
        return { ...empty, error: "A chave do Google não está liberada para o PageSpeed Insights API. Ative a API e marque-a nas restrições da chave." };
      }
      return { ...empty, error: res.status === 429 ? "Limite do PageSpeed atingido. Configure GOOGLE_API_KEY." : msg || `HTTP ${res.status}` };
    }
  } catch {
    return { ...empty, error: "O PageSpeed não respondeu a tempo." };
  }

  const lh = (json.lighthouseResult ?? {}) as { categories?: Record<string, { score?: number }>; audits?: Record<string, Audit> };
  const cats = lh.categories ?? {};
  const audits = lh.audits ?? {};

  const metrics = METRICS.filter((m) => audits[m.id]).map((m) => {
    const a = audits[m.id];
    return { label: m.label, value: a.displayValue ?? "—", good: typeof a.numericValue === "number" ? m.good(a.numericValue) : null };
  });

  const le = (json.loadingExperience ?? {}) as { metrics?: Record<string, { percentile?: number; category?: string }> };
  const field = Object.entries(le.metrics ?? {})
    .filter(([k]) => FIELD[k])
    .map(([k, v]) => ({
      label: FIELD[k],
      value: k === "CUMULATIVE_LAYOUT_SHIFT_SCORE" ? String((v.percentile ?? 0) / 100) : `${((v.percentile ?? 0) / 1000).toFixed(1)} s`,
      category: v.category === "FAST" ? "bom" : v.category === "AVERAGE" ? "médio" : v.category === "SLOW" ? "ruim" : "—",
    }));

  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && typeof a.score === "number" && a.score < 0.9 && a.title)
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 6)
    .map((a) => ({ title: a.title!, saving: a.displayValue ?? null }));

  const seoRefs = ((lh as { categories?: Record<string, { auditRefs?: { id: string; weight?: number }[] }> }).categories?.seo?.auditRefs ?? [])
    .filter((r) => (r.weight ?? 0) > 0)
    .map((r) => audits[r.id])
    .filter((a): a is Audit => Boolean(a && a.score === 0 && a.title))
    .map((a) => a.title!);

  return {
    strategy,
    ok: true,
    scores: {
      performance: pct(cats.performance?.score),
      seo: pct(cats.seo?.score),
      accessibility: pct(cats.accessibility?.score),
      bestPractices: pct(cats["best-practices"]?.score),
    },
    metrics,
    field,
    opportunities,
    failedSeo: seoRefs.slice(0, 8),
  };
}
