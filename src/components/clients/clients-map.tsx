"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { BR_VIEWBOX, REGIOES, UF_NOME, UF_SHAPES } from "@/lib/geo/brasil";
import type { MapClient } from "@/lib/data/client-map";

type UfStat = { uf: string; clients: MapClient[]; cities: Map<string, MapClient[]> };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function group(clients: MapClient[]) {
  const byUf = new Map<string, UfStat>();
  const noUf: MapClient[] = [];
  for (const c of clients) {
    if (!c.uf) {
      noUf.push(c);
      continue;
    }
    const s: UfStat = byUf.get(c.uf) ?? { uf: c.uf, clients: [], cities: new Map() };
    s.clients.push(c);
    const city = c.city || "Cidade não informada";
    s.cities.set(city, [...(s.cities.get(city) ?? []), c]);
    byUf.set(c.uf, s);
  }
  return { byUf, noUf };
}

export function ClientsMap({ clients }: { clients: MapClient[] }) {
  const { byUf, noUf } = useMemo(() => group(clients), [clients]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  const max = Math.max(1, ...[...byUf.values()].map((s) => s.clients.length));
  const ranking = [...byUf.values()].sort((a, b) => b.clients.length - a.clients.length || collator.compare(UF_NOME[a.uf], UF_NOME[b.uf]));
  const regions = REGIOES.map((r) => ({
    r,
    n: ranking.filter((s) => UF_SHAPES.find((u) => u.uf === s.uf)?.regiao === r).reduce((t, s) => t + s.clients.length, 0),
  }));
  const located = clients.length - noUf.length;

  const fill = (uf: string) => {
    const s = byUf.get(uf);
    if (!s) return "var(--color-line)";
    const pct = Math.round(30 + 70 * (s.clients.length / max));
    return `color-mix(in oklab, var(--color-chart) ${pct}%, var(--color-line))`;
  };

  const move = (e: MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const hovered = hover ? byUf.get(hover) : null;
  const current = selected ? byUf.get(selected) : null;
  const toggle = (uf: string) => {
    if (!byUf.has(uf)) return;
    setSelected((s) => (s === uf ? null : uf));
    // no celular o painel fica abaixo do mapa: leva a pessoa até a lista do estado
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-6">
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Clientes por região">
          {regions.map(({ r, n }) => (
            <li key={r} className={cn("rounded-full border px-3 py-1 text-[13px]", n ? "border-line-strong text-ink" : "border-line text-faint")}>
              {r} <span className="font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>

        <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
          <svg viewBox={BR_VIEWBOX} className="block h-auto w-full" role="img" aria-label={`Mapa do Brasil com ${plural(located, "cliente", "clientes")} por estado`}>
            {UF_SHAPES.map((s) => {
              const stat = byUf.get(s.uf);
              const isSel = selected === s.uf;
              const isHover = hover === s.uf;
              return (
                <path
                  key={s.uf}
                  d={s.d}
                  fill={fill(s.uf)}
                  stroke={isSel ? "var(--color-ink)" : "var(--color-surface)"}
                  strokeWidth={isSel ? 2.4 : 1.1}
                  strokeLinejoin="round"
                  className={cn("transition-[fill,filter] duration-150", stat ? "cursor-pointer outline-none" : "", isHover && stat && "brightness-110")}
                  style={isHover && !stat ? { fill: "var(--color-line-strong)" } : undefined}
                  tabIndex={stat ? 0 : -1}
                  role={stat ? "button" : undefined}
                  aria-label={stat ? `${s.nome}: ${plural(stat.clients.length, "cliente", "clientes")}` : undefined}
                  aria-pressed={stat ? isSel : undefined}
                  onMouseEnter={() => setHover(s.uf)}
                  onMouseMove={move}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(s.uf)}
                  onBlur={() => setHover(null)}
                  onClick={() => toggle(s.uf)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(s.uf);
                    }
                  }}
                />
              );
            })}
            {/* marcador com o número de clientes, no ponto do estado mais afastado das bordas */}
            {ranking.map((st) => {
              const shape = UF_SHAPES.find((u) => u.uf === st.uf);
              if (!shape) return null;
              const n = st.clients.length;
              const r = n > 9 ? 17 : 15;
              return (
                <g key={st.uf} className="pointer-events-none select-none" aria-hidden>
                  <circle cx={shape.lx} cy={shape.ly} r={r} fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth={3} />
                  <text x={shape.lx} y={shape.ly} dy="0.35em" textAnchor="middle" fill="var(--color-on-ink)" fontSize={15} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {n}
                  </text>
                </g>
              );
            })}
          </svg>

          {tip && hover ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-max max-w-[260px] -translate-x-1/2 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-pop)]"
              style={{ left: tip.x, top: tip.y + 18 }}
            >
              <p className="font-semibold text-ink">
                {UF_NOME[hover]} ({hover})
              </p>
              {hovered ? (
                <>
                  <p className="text-muted">
                    {plural(hovered.clients.length, "cliente", "clientes")} em {plural(hovered.cities.size, "cidade", "cidades")}
                  </p>
                  <p className="mt-1 text-text">{[...hovered.cities.keys()].sort(collator.compare).slice(0, 4).join(", ")}{hovered.cities.size > 4 ? "…" : ""}</p>
                </>
              ) : (
                <p className="text-muted">Nenhum cliente ainda</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[12.5px] text-muted">
          <span>Menos</span>
          <span aria-hidden className="h-2 min-w-24 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--color-chart) 30%, var(--color-line)), var(--color-chart))" }} />
          <span>Mais clientes</span>
          <span aria-hidden className="ml-2 h-3 w-4 rounded-[4px] bg-line" />
          <span>Sem cliente</span>
        </div>
      </div>

      <aside ref={panel} className="scroll-mt-20 rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto" aria-live="polite">
        {current ? (
          <>
            <button type="button" onClick={() => setSelected(null)} className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-control)] pr-2 text-sm text-muted hover:text-ink">
              <ChevronLeft className="size-4" aria-hidden />
              Todos os estados
            </button>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[20px] font-bold text-ink">{UF_NOME[current.uf]}</h2>
              <span className="text-sm text-muted">
                {plural(current.clients.length, "cliente", "clientes")} em {plural(current.cities.size, "cidade", "cidades")}
              </span>
            </div>
            <div className="mt-4 space-y-5">
              {[...current.cities.entries()]
                .sort((a, b) => b[1].length - a[1].length || collator.compare(a[0], b[0]))
                .map(([city, list]) => (
                  <section key={city}>
                    <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                      <MapPin className="size-3.5 text-muted" aria-hidden />
                      {city}
                      <span className="font-normal text-muted">({list.length})</span>
                    </h3>
                    <ClientList clients={list} />
                  </section>
                ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[15px] font-semibold text-ink">Clientes por estado</h2>
            <p className="mt-0.5 text-[13px] text-muted">Passe o mouse no mapa para ver as cidades. Clique para ver os clientes.</p>
            {ranking.length ? (
              <ul className="mt-4 space-y-1.5">
                {ranking.map((s) => (
                  <li key={s.uf}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.uf)}
                      onMouseEnter={() => setHover(s.uf)}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                        hover === s.uf ? "border-ink bg-sunken" : "border-line hover:border-line-hover",
                      )}
                    >
                      <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-sunken text-[12px] font-bold text-ink">{s.uf}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{UF_NOME[s.uf]}</span>
                        <span className="block truncate text-[12.5px] text-muted">{[...s.cities.keys()].sort(collator.compare).join(", ")}</span>
                      </span>
                      <span className="text-[15px] font-bold text-ink tabular-nums">{s.clients.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Nenhum cliente com estado cadastrado ainda.</p>
            )}
            {noUf.length ? (
              <div className="mt-6 border-t border-line pt-4">
                <h3 className="text-[13.5px] font-semibold text-ink">Sem estado no cadastro ({noUf.length})</h3>
                <p className="text-[12.5px] text-muted">Abra o cliente e preencha cidade e UF para ele aparecer no mapa.</p>
                <ClientList clients={noUf} />
              </div>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}

function ClientList({ clients }: { clients: MapClient[] }) {
  return (
    <ul className="mt-1.5 divide-y divide-line">
      {[...clients]
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((c) => (
          <li key={c.key}>
            <Link href={`/clientes/${c.id}`} className="group flex items-center gap-3 py-2.5 hover:text-ink">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink group-hover:underline">
                  {c.name}
                  {c.unit ? <span className="font-normal text-muted"> ({c.unit})</span> : null}
                </span>
                <span className="block truncate text-[12.5px] text-muted">
                  {[c.segment, c.site].filter(Boolean).join(", ") || "Sem segmento"}
                  {c.status === "paused" ? ", pausado" : ""}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
            </Link>
          </li>
        ))}
    </ul>
  );
}
