import type { BusinessResult } from "./business";
import type { PageSpeedResult } from "./pagespeed";
import type { SiteChecks } from "./site-checks";

export type Scores = {
  overall: number | null;
  performance: number | null;
  seo: number | null;
  geo: number | null;
  business: number | null;
};

export const SCORE_LABELS: { key: Exclude<keyof Scores, "overall">; label: string; hint: string }[] = [
  { key: "performance", label: "Velocidade", hint: "Nota do Google PageSpeed no celular, onde está a maior parte das visitas." },
  { key: "seo", label: "SEO técnico", hint: "Base para aparecer no Google: título, descrição, sitemap, estrutura e conteúdo." },
  { key: "geo", label: "Preparo para IAs", hint: "Chance de a empresa ser citada pelo ChatGPT, Gemini e Perplexity." },
  { key: "business", label: "Google Empresas", hint: "Força do perfil no Google Maps: avaliações, fotos, horário e site." },
];

const ratio = (list: { ok: boolean }[]) => (list.length ? Math.round((list.filter((c) => c.ok).length / list.length) * 100) : null);

export function computeScores(ps: { mobile: PageSpeedResult; desktop: PageSpeedResult }, site: SiteChecks, business: BusinessResult): Scores {
  const performance = ps.mobile.ok ? ps.mobile.scores.performance : ps.desktop.ok ? ps.desktop.scores.performance : null;

  const seoChecks = ratio(site.checks.filter((c) => c.group !== "geo"));
  const lighthouseSeo = ps.mobile.scores.seo ?? ps.desktop.scores.seo;
  const seo = seoChecks === null ? lighthouseSeo : lighthouseSeo === null ? seoChecks : Math.round(seoChecks * 0.6 + lighthouseSeo * 0.4);

  const geo = ratio(site.checks.filter((c) => c.group === "geo"));
  const businessScore = business.found ? ratio(business.checks) : business.error ? null : 0;

  const parts: [number | null, number][] = [
    [performance, 0.25],
    [seo, 0.25],
    [geo, 0.2],
    [businessScore, 0.3],
  ];
  const valid = parts.filter((p): p is [number, number] => p[0] !== null);
  const weight = valid.reduce((s, p) => s + p[1], 0);
  const overall = weight ? Math.round(valid.reduce((s, p) => s + p[0] * p[1], 0) / weight) : null;

  return { overall, performance, seo, geo, business: businessScore };
}

export function scoreTone(v: number | null): "ok" | "warn" | "danger" | "neutral" {
  if (v === null) return "neutral";
  return v >= 90 ? "ok" : v >= 50 ? "warn" : "danger";
}

export function scoreWord(v: number | null): string {
  if (v === null) return "Sem dados";
  return v >= 90 ? "Bom" : v >= 70 ? "Razoável" : v >= 50 ? "Precisa melhorar" : "Crítico";
}
