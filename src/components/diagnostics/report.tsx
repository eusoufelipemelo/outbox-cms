import { Check, ExternalLink, X } from "lucide-react";
import { cn, formatDate, hostname } from "@/lib/utils";
import type { Diagnostic } from "@/lib/data/diagnostics";
import { SCORE_LABELS, scoreTone, scoreWord } from "@/lib/diagnostics/scoring";
import type { PageSpeedResult } from "@/lib/diagnostics/pagespeed";
import type { Report } from "@/lib/diagnostics/report";
import { AiSpotlight } from "./ai-spotlight";

const toneText = { ok: "text-ok", warn: "text-warn", danger: "text-danger", neutral: "text-faint" } as const;
const toneBar = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-line-strong" } as const;

function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("break-inside-avoid-page border-t border-line pt-8", className)}>
      <h2 className="text-[22px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {description ? <p className="mt-1 max-w-[62ch] text-[15px] text-muted">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Régua 0–100 com a marca de 90, a linha que o Google considera "bom". */
function ScoreRow({ label, hint, value }: { label: string; hint: string; value: number | null }) {
  const tone = scoreTone(value);
  return (
    <div className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[200px_1fr_120px] sm:items-center">
      <div>
        <p className="font-semibold text-ink">{label}</p>
        <p className="text-[13px] text-muted sm:hidden">{hint}</p>
      </div>
      <div>
        <div className="relative h-2.5 rounded-full bg-sunken" role="img" aria-label={`${label}: ${value ?? "sem dados"} de 100`}>
          <div className={cn("h-full rounded-full", toneBar[tone])} style={{ width: `${value ?? 0}%` }} />
          <span aria-hidden className="absolute -top-1 -bottom-1 left-[90%] w-px bg-ink/40" />
        </div>
        <p className="mt-1.5 hidden text-[13px] text-muted sm:block">{hint}</p>
      </div>
      <p className="flex items-baseline gap-2 sm:justify-end">
        <span className={cn("text-[28px] leading-none font-extrabold tabular-nums", toneText[tone])}>{value ?? "—"}</span>
        <span className="text-[13px] text-muted">{scoreWord(value)}</span>
      </p>
    </div>
  );
}

const severity = {
  alta: { label: "Prioridade alta", cls: "bg-danger-soft text-danger" },
  media: { label: "Prioridade média", cls: "bg-warn-soft text-warn" },
  baixa: { label: "Prioridade baixa", cls: "bg-info-soft text-info" },
} as const;

function Problems({ items }: { items: Report["problems"] }) {
  return (
    <ol className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
      {items.map((p, i) => (
        <li key={i} className="grid gap-4 p-5 break-inside-avoid md:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", severity[p.severity].cls)}>{severity[p.severity].label}</span>
              <span className="text-[13px] text-muted">{p.area}</span>
            </div>
            <p className="mt-2 text-[17px] font-semibold text-ink">{p.title}</p>
            <p className="mt-1 text-[15px] text-text">{p.impact}</p>
          </div>
          <div className="rounded-[var(--radius-control)] bg-sunken p-4">
            <p className="text-[13px] font-semibold text-ink">Como corrigimos</p>
            <p className="mt-1 text-[15px] text-text">{p.fix}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Fases → colunas da régua de 12 meses. */
function spanOf(period: string, index: number): [number, number] {
  const nums = (period.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 12);
  if (nums.length >= 2) return [nums[0], nums[nums.length - 1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return ([[1, 2], [3, 4], [5, 6], [7, 12]] as [number, number][])[index] ?? [1, 12];
}

function Plan({ plan }: { plan: Report["plan"] }) {
  return (
    <div>
      {/* Régua: o marco do prazo mínimo (6 meses) e do ideal (12 meses) */}
      <div className="hidden md:block" aria-hidden>
        <div className="grid grid-cols-12 text-[12.5px] text-muted">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={cn("border-l border-line pb-2 pl-1.5", i === 6 && "border-l-2 border-ink")}>
              mês {i + 1}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-1">
          {plan.map((phase, i) => {
            const [a, b] = spanOf(phase.period, i);
            return (
              <div
                key={i}
                className={cn("h-3 rounded-full", b <= 6 ? "bg-ink" : "bg-brand")}
                style={{ gridColumn: `${a} / ${b + 1}` }}
              />
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-12 text-[13px] font-semibold">
          <p className="col-span-6 text-ink">Prazo mínimo: 6 meses</p>
          <p className="col-span-6 border-l-2 border-ink pl-2 text-brand-ink">Prazo ideal: 12 meses</p>
        </div>
      </div>

      <ol className="mt-6 grid gap-4 md:grid-cols-4">
        {plan.map((phase, i) => {
          const [, b] = spanOf(phase.period, i);
          return (
            <li key={i} className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 break-inside-avoid">
              <p className={cn("text-[13px] font-semibold", b <= 6 ? "text-muted" : "text-brand-ink")}>{phase.period}</p>
              <p className="mt-1 text-[17px] leading-snug font-bold text-ink">{phase.focus}</p>
              <ul className="mt-3 space-y-2 text-[14.5px] text-text">
                {phase.actions.map((a, j) => (
                  <li key={j} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-line-strong" />
                    {a}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-[14px] text-muted">
                <span className="font-semibold text-ink">Ao fim da fase: </span>
                {phase.result}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CheckList({ items }: { items: { label: string; ok: boolean; detail: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.label} className="flex gap-3 py-2.5 break-inside-avoid">
          <span
            className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}
          >
            {c.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            <span className="sr-only">{c.ok ? "OK" : "Precisa corrigir"}</span>
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-ink">{c.label}</p>
            <p className="text-[13.5px] break-words text-muted">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SpeedBlock({ title, ps }: { title: string; ps: PageSpeedResult }) {
  if (!ps.ok) {
    return (
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-muted">Sem medição: {ps.error}</p>
      </div>
    );
  }
  const cats = [
    ["Desempenho", ps.scores.performance],
    ["SEO", ps.scores.seo],
    ["Acessibilidade", ps.scores.accessibility],
    ["Boas práticas", ps.scores.bestPractices],
  ] as const;
  return (
    <div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <dl className="mt-3 grid grid-cols-4 gap-2">
        {cats.map(([label, v]) => (
          <div key={label} className="rounded-[var(--radius-control)] bg-sunken px-2 py-3 text-center">
            <dd className={cn("text-[22px] font-extrabold tabular-nums", toneText[scoreTone(v)])}>{v ?? "—"}</dd>
            <dt className="text-[12px] text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <ul className="mt-3 divide-y divide-line text-[14px]">
        {ps.metrics.map((m) => (
          <li key={m.label} className="flex justify-between gap-3 py-2">
            <span className="text-text">{m.label}</span>
            <span className={cn("font-semibold tabular-nums", m.good === false ? "text-danger" : m.good ? "text-ok" : "text-muted")}>{m.value}</span>
          </li>
        ))}
      </ul>
      {ps.opportunities.length ? (
        <>
          <p className="mt-4 text-[13px] font-semibold text-ink">O que mais pesa</p>
          <ul className="mt-1 space-y-1 text-[13.5px] text-muted">
            {ps.opportunities.slice(0, 4).map((o) => (
              <li key={o.title}>
                {o.title}
                {o.saving ? ` (${o.saving})` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function DiagnosticReport({ d }: { d: Diagnostic }) {
  const scores = d.scores;
  const report = d.report;
  const site = d.site_checks;
  const biz = d.business;
  const ps = d.pagespeed;
  const overall = scores?.overall ?? null;

  return (
    <article className="space-y-10">
      <header className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="min-w-0">
          <p className="text-[15px] text-muted">Diagnóstico de presença digital, {formatDate(d.finished_at ?? d.created_at)}</p>
          <h1 className="display mt-2 text-[clamp(2rem,5vw,3.25rem)] break-words">{d.business_name || biz?.name || hostname(d.url)}</h1>
          <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[15px] text-muted underline-offset-4 hover:text-ink hover:underline">
            {hostname(d.url)}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <div className="md:text-right">
          <p className={cn("text-[64px] leading-none font-extrabold tabular-nums", toneText[scoreTone(overall)])}>
            {overall ?? "—"}
            <span className="text-[22px] font-semibold text-faint">/100</span>
          </p>
          <p className="mt-1 text-sm text-muted">Nota geral: {scoreWord(overall).toLowerCase()}</p>
        </div>
      </header>

      {report ? <p className="max-w-[70ch] text-[18px] leading-relaxed text-text">{report.summary}</p> : null}

      <Section title="Onde está hoje" description="Notas de 0 a 100. A linha vertical marca 90, a nota que o Google considera boa.">
        <div className="divide-y divide-line">
          {SCORE_LABELS.map((s) => (
            <ScoreRow key={s.key} label={s.label} hint={s.hint} value={scores?.[s.key] ?? null} />
          ))}
        </div>
      </Section>

      <AiSpotlight d={d} />

      {report?.problems.length ? (
        <Section title="Principais problemas" description="Do mais urgente ao menos urgente, com o que cada um custa e como vamos resolver.">
          <Problems items={report.problems} />
        </Section>
      ) : null}

      {report?.plan.length ? (
        <Section title="Plano de 6 a 12 meses" description="Em 6 meses os problemas principais estão resolvidos. Em 12 meses o site consolida autoridade no Google e nas IAs.">
          <Plan plan={report.plan} />
        </Section>
      ) : null}

      <Section title="O que foi medido" description="Dados coletados no Google PageSpeed Insights, no Google Maps e direto no site, no dia do diagnóstico.">
        <div className="grid gap-8 lg:grid-cols-2">
          {ps ? (
            <>
              <SpeedBlock title="Velocidade no celular" ps={ps.mobile} />
              <SpeedBlock title="Velocidade no computador" ps={ps.desktop} />
            </>
          ) : null}
          <div>
            <h3 className="font-semibold text-ink">Google Empresas</h3>
            {biz?.found ? (
              <>
                <p className="mt-2 text-[14.5px] text-text">
                  {biz.name}
                  {biz.category ? `, ${biz.category}` : ""}
                  {biz.address ? <span className="block text-muted">{biz.address}</span> : null}
                </p>
                {biz.mapsUrl ? (
                  <a href={biz.mapsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13.5px] text-brand-ink underline underline-offset-4 print:hidden">
                    Ver no Google Maps
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
                <div className="mt-2">
                  <CheckList items={biz.checks} />
                </div>
                <p className="mt-2 text-[13px] text-faint">Publicações e respostas às avaliações não aparecem para o Google de fora: o consultor confere no próprio perfil.</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {biz?.error ??
                  "Não encontramos um perfil no Google Empresas ligado a este site. Sem perfil, a empresa não aparece no Google Maps nem nas buscas por perto de mim."}
              </p>
            )}
          </div>
          {site ? (
            <div>
              <h3 className="font-semibold text-ink">Estrutura do site</h3>
              {site.ok ? <div className="mt-2"><CheckList items={site.checks} /></div> : <p className="mt-2 text-sm text-muted">{site.error}</p>}
            </div>
          ) : null}
        </div>
      </Section>

      {report?.nextSteps.length ? (
        <Section title="Próximos passos">
          <ol className="max-w-[70ch] list-decimal space-y-2 pl-5 text-[16px] text-text marker:font-semibold marker:text-ink">
            {report.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      <footer className="border-t border-line pt-6 text-[13px] text-faint">
        Diagnóstico feito pela OutBox em {formatDate(d.finished_at ?? d.created_at)}. As notas mudam com o tempo: refaça o diagnóstico para acompanhar a evolução.
      </footer>
    </article>
  );
}
