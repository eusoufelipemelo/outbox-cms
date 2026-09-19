"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// Gráficos do painel. Uma série por gráfico, no laranja OutBox (--color-chart), marcas finas,
// grade discreta, tooltip no hover/foco e tabela para leitores de tela.

const nf = new Intl.NumberFormat("pt-BR");
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export type ChartPoint = { key: string; label: string; value: number };

/** Topo "redondo" do eixo e 3 marcas (0, meio, topo). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2];
  const raw = max / 2;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const s = step < 1 ? 1 : Math.ceil(step);
  return [0, s, s * 2];
}

function SrTable({ caption, unit, points }: { caption: string; unit: string; points: ChartPoint[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          <th scope="col">{unit}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.key}>
            <th scope="row">{p.label}</th>
            <td>{nf.format(p.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function YAxis({ ticks }: { ticks: number[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((t) => (
        <div key={t} className="absolute right-0 left-0 flex items-center" style={{ bottom: `${(t / ticks[2]) * 100}%` }}>
          <span className="w-8 shrink-0 -translate-y-px pr-2 text-right text-[11px] text-faint tabular-nums">{compact.format(t)}</span>
          <span className={cn("h-px flex-1", t === 0 ? "bg-line-strong" : "bg-grid")} />
        </div>
      ))}
    </div>
  );
}

/** Rótulos do eixo X: primeiro, meio e último (sem poluir). */
function XLabels({ points }: { points: ChartPoint[] }) {
  if (!points.length) return null;
  const idx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return (
    <div aria-hidden className="relative mt-2 ml-8 h-4 text-[11px] text-faint">
      {idx.map((i) => (
        <span
          key={i}
          className={cn("absolute whitespace-nowrap", i === 0 ? "left-0" : i === points.length - 1 ? "right-0" : "-translate-x-1/2")}
          style={i !== 0 && i !== points.length - 1 ? { left: `${((i + 0.5) / points.length) * 100}%` } : undefined}
        >
          {points[i].label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, value, unit, label }: { x: number; value: number; unit: [string, string]; label: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 whitespace-nowrap shadow-[var(--shadow-pop)]"
      style={{ left: `clamp(48px, ${x}%, calc(100% - 48px))` }}
    >
      <p className="text-[15px] font-semibold text-ink tabular-nums">
        {nf.format(value)} <span className="text-[12px] font-normal text-muted">{value === 1 ? unit[0] : unit[1]}</span>
      </p>
      <p className="text-[12px] text-muted">{label}</p>
    </div>
  );
}

/** Colunas (contagens por dia/semana). Cada coluna é alvo de hover e foco. */
export function ColumnChart({ points, unit, caption }: { points: ChartPoint[]; unit: [string, string]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = useMemo(() => niceTicks(Math.max(0, ...points.map((p) => p.value))), [points]);
  const top = ticks[2];
  return (
    <figure className="relative">
      <div className="relative h-44" onPointerLeave={() => setActive(null)}>
        <YAxis ticks={ticks} />
        <div className="absolute inset-0 left-8 flex items-end gap-[2px]">
          {points.map((p, i) => {
            const h = (p.value / top) * 100;
            return (
              <button
                key={p.key}
                type="button"
                aria-label={`${p.label}: ${nf.format(p.value)} ${p.value === 1 ? unit[0] : unit[1]}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center focus-visible:outline-offset-0"
              >
                <span
                  className={cn(
                    "w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity duration-150",
                    p.value === 0 && "h-[2px] rounded-none bg-line-strong",
                    active !== null && active !== i && "opacity-45",
                  )}
                  style={p.value ? { height: `${Math.max(h, 2)}%` } : undefined}
                />
              </button>
            );
          })}
          {active !== null ? (
            <Tooltip x={((active + 0.5) / points.length) * 100} value={points[active].value} unit={unit} label={points[active].label} />
          ) : null}
        </div>
      </div>
      <XLabels points={points} />
      <SrTable caption={caption} unit={unit[1]} points={points} />
    </figure>
  );
}

/** Área + linha (série diária) com mira vertical que acompanha o ponteiro. */
export function AreaChart({ points, unit, caption }: { points: ChartPoint[]; unit: [string, string]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const gradId = useId();
  const ticks = useMemo(() => niceTicks(Math.max(0, ...points.map((p) => p.value))), [points]);
  const top = ticks[2];
  const n = points.length;
  const xs = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const ys = (v: number) => 100 - (v / top) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${xs(i)},${ys(p.value)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  function pick(clientX: number) {
    const el = ref.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setActive(Math.round(ratio * (n - 1)));
  }

  return (
    <figure className="relative">
      <div className="relative h-44">
        <YAxis ticks={ticks} />
        <div
          ref={ref}
          tabIndex={0}
          role="img"
          aria-label={caption}
          className="absolute inset-0 left-8 cursor-crosshair rounded-md focus-visible:outline-offset-2"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
            if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
            if (e.key === "Escape") setActive(null);
          }}
          onBlur={() => setActive(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-chart)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke="var(--color-chart)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {active !== null ? (
            <>
              <span aria-hidden className="absolute top-0 bottom-0 w-px bg-line-strong" style={{ left: `${xs(active)}%` }} />
              <span
                aria-hidden
                className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-chart ring-2 ring-surface"
                style={{ left: `${xs(active)}%`, bottom: `${100 - ys(points[active].value)}%` }}
              />
              <Tooltip x={xs(active)} value={points[active].value} unit={unit} label={points[active].label} />
            </>
          ) : null}
        </div>
      </div>
      <XLabels points={points} />
      <SrTable caption={caption} unit={unit[1]} points={points} />
    </figure>
  );
}

/** Barras horizontais com valor na ponta (ranking de clientes). */
export function BarList({ items, unit, empty }: { items: { id: string; name: string; value: number }[]; unit: [string, string]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate text-text">{it.name}</span>
            <span className="shrink-0 font-semibold text-ink tabular-nums">
              {nf.format(it.value)} <span className="font-normal text-muted">{it.value === 1 ? unit[0] : unit[1]}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-sunken" aria-hidden>
            <div className="h-2 rounded-full bg-chart" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 100},${100 - (v / max) * 90 - 5}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-24 overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--color-chart)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Cartão de indicador: rótulo, valor, variação vs período anterior e tendência. */
export function StatTile({
  label,
  value,
  suffix,
  previous,
  previousLabel,
  trend,
  note,
}: {
  label: string;
  value: number;
  suffix?: string;
  previous?: number;
  previousLabel?: string;
  trend?: number[];
  note?: string;
}) {
  let delta: { text: string; tone: "up" | "down" | "flat" } | null = null;
  if (previous !== undefined) {
    if (previous === 0 && value === 0) delta = { text: "sem variação", tone: "flat" };
    else if (previous === 0) delta = { text: "novo no período", tone: "up" };
    else {
      const pct = Math.round(((value - previous) / previous) * 100);
      delta = { text: `${pct > 0 ? "+" : ""}${pct}%`, tone: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
    }
  }
  const Icon = delta?.tone === "up" ? ArrowUpRight : delta?.tone === "down" ? ArrowDownRight : Minus;
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
      <p className="text-[13.5px] text-muted">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-[34px] leading-none font-bold tracking-tight text-ink">
          {nf.format(value)}
          {suffix ? <span className="ml-0.5 text-[20px] font-semibold text-muted">{suffix}</span> : null}
        </p>
        {trend ? <Sparkline values={trend} /> : null}
      </div>
      {delta ? (
        <p className="flex items-center gap-1 text-[12.5px] text-muted">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              delta.tone === "up" && "text-ok",
              delta.tone === "down" && "text-danger",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {delta.text}
          </span>
          <span>vs {previousLabel}</span>
        </p>
      ) : note ? (
        <p className="text-[12.5px] text-muted">{note}</p>
      ) : null}
    </div>
  );
}
