"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelBucket, ChannelKey, Channels } from "@/lib/data/channels";

const nf = new Intl.NumberFormat("pt-BR");

export const CHANNELS: { key: ChannelKey; name: string; color: string; unit: [string, string] }[] = [
  { key: "blog", name: "Blog", color: "var(--color-ch-blog)", unit: ["artigo no ar", "artigos no ar"] },
  { key: "google", name: "Google Empresas", color: "var(--color-ch-google)", unit: ["novidade publicada", "novidades publicadas"] },
  { key: "instagram", name: "Instagram", color: "var(--color-ch-instagram)", unit: ["post publicado", "posts publicados"] },
];

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-28" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ value, previous, label }: { value: number; previous: number; label: string }) {
  if (!previous && !value) return <span className="text-[12.5px] text-faint">Sem movimento no período</span>;
  if (!previous) return <span className="text-[12.5px] text-muted">Novo neste período</span>;
  const pct = Math.round(((value - previous) / previous) * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12.5px]", pct > 0 ? "text-ok" : pct < 0 ? "text-danger" : "text-muted")}>
      <Icon className="size-3.5" aria-hidden />
      {pct > 0 ? "+" : ""}
      {pct}% <span className="text-muted">vs {label}</span>
    </span>
  );
}

/** A faixa dos três canais: mesma leitura para Blog, Google Empresas e Instagram. */
export function ChannelBand({ data, previousLabel }: { data: Channels; previousLabel: string }) {
  const foot: Record<ChannelKey, string> = {
    blog: `${data.reach.sites} site(s) ativo(s)`,
    google: `${data.reach.gbpProfiles} perfil(is) ligado(s)${data.failures.google ? `, ${data.failures.google} falha(s)` : ""}`,
    instagram: `${data.reach.igAccounts} conta(s) conectada(s)${data.failures.instagram ? `, ${data.failures.instagram} falha(s)` : ""}`,
  };
  return (
    <section aria-label="Canais" className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface md:grid-cols-3">
      {CHANNELS.map((c, i) => {
        const s = data.stats[c.key];
        return (
          <div key={c.key} className={cn("relative p-5", i > 0 && "border-t border-line md:border-t-0 md:border-l")}>
            <span aria-hidden className="absolute top-0 left-0 h-1 w-full" style={{ background: c.color }} />
            <p className="text-[14px] font-semibold text-ink">{c.name}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="leading-none">
                <span className="text-[40px] font-extrabold text-ink tabular-nums">{nf.format(s.value)}</span>
                <span className="mt-1 block text-[12.5px] text-muted">{s.value === 1 ? c.unit[0] : c.unit[1]}</span>
              </p>
              <Spark values={s.trend} color={c.color} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Delta value={s.value} previous={s.previous} label={previousLabel} />
              <span className="text-[12.5px] text-muted">{foot[c.key]}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Colunas empilhadas: o que foi ao ar em cada canal, dia a dia (ou por semana em 90 dias). */
export function ChannelColumns({ series, caption }: { series: ChannelBucket[]; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = series.map((b) => b.blog + b.google + b.instagram);
  const max = Math.max(1, ...totals);
  const top = max <= 4 ? 4 : Math.ceil(max / 2) * 2;
  const h = hover !== null ? series[hover] : null;

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-4 text-[12.5px] text-muted" aria-label="Legenda">
        {CHANNELS.map((c) => (
          <li key={c.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
            {c.name}
          </li>
        ))}
      </ul>
      <div className="relative h-48">
        {[0, 0.5, 1].map((t) => (
          <div key={t} aria-hidden className="absolute right-0 left-8 border-t border-grid" style={{ bottom: `${t * 100}%` }}>
            <span className="absolute -top-2 -left-8 w-7 text-right text-[11px] text-faint tabular-nums">{Math.round(top * t)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-8 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {series.map((b, i) => (
            <div
              key={b.key}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              tabIndex={0}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${b.label}: ${b.blog} no blog, ${b.google} no Google, ${b.instagram} no Instagram`}
            >
              {(["instagram", "google", "blog"] as const).map((k) => {
                const v = b[k];
                if (!v) return null;
                const color = CHANNELS.find((c) => c.key === k)!.color;
                return <div key={k} style={{ height: `${(v / top) * 100}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.35 }} className="w-full first:rounded-t-[3px]" />;
              })}
            </div>
          ))}
        </div>
        {h ? (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] whitespace-nowrap shadow-[var(--shadow-pop)]"
            style={{ left: `clamp(80px, ${((hover! + 0.5) / series.length) * 100}%, calc(100% - 80px))` }}
          >
            <p className="font-semibold text-ink">{h.label}</p>
            {CHANNELS.map((c) => (
              <p key={c.key} className="flex items-center gap-1.5 text-muted">
                <span aria-hidden className="size-2 rounded-[2px]" style={{ background: c.color }} />
                {c.name}: <span className="font-semibold text-ink tabular-nums">{h[c.key]}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-2 ml-8 flex justify-between text-[11px] text-faint">
        <span>{series[0]?.label}</span>
        <span>{series[series.length - 1]?.label}</span>
      </p>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Período</th>
            <th>Blog</th>
            <th>Google Empresas</th>
            <th>Instagram</th>
          </tr>
        </thead>
        <tbody>
          {series.map((b) => (
            <tr key={b.key}>
              <th>{b.label}</th>
              <td>{b.blog}</td>
              <td>{b.google}</td>
              <td>{b.instagram}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Fila de aprovação dos clientes e a mistura de pacotes. */
export function QueueAndPackages({ data }: { data: Channels }) {
  const p = data.packages;
  const total = Math.max(1, p.completo + p.blog + p.instagram + p.nenhum);
  const mix = [
    { key: "completo", label: "Pacote completo", n: p.completo, color: "var(--color-ch-blog)" },
    { key: "blog", label: "Blog + Google", n: p.blog, color: "var(--color-ch-google)" },
    { key: "instagram", label: "Só Instagram", n: p.instagram, color: "var(--color-ch-instagram)" },
    { key: "nenhum", label: "Sem serviço", n: p.nenhum, color: "var(--color-line-strong)" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[14px] font-semibold text-ink">Esperando o cliente</p>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href="/automacao" className="flex items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2.5 hover:border-line-hover">
              <span className="text-[13.5px] text-text">Artigos para aprovar</span>
              <span className="text-[18px] font-bold text-ink tabular-nums">{data.queue.blog}</span>
            </Link>
          </li>
          <li>
            <Link href="/instagram" className="flex items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2.5 hover:border-line-hover">
              <span className="text-[13.5px] text-text">Posts do Instagram para aprovar</span>
              <span className="text-[18px] font-bold text-ink tabular-nums">{data.queue.instagram}</span>
            </Link>
          </li>
          <li>
            <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2.5">
              <span className="text-[13.5px] text-text">Ajustes pedidos</span>
              <span className={cn("text-[18px] font-bold tabular-nums", data.queue.changes ? "text-danger" : "text-ink")}>{data.queue.changes}</span>
            </div>
          </li>
        </ul>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">Clientes por pacote</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={mix.map((m) => `${m.label}: ${m.n}`).join(", ")}>
          {mix.map((m) => (m.n ? <span key={m.key} style={{ width: `${(m.n / total) * 100}%`, background: m.color }} /> : null))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          {mix.map((m) => (
            <li key={m.key} className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: m.color }} />
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              <span className="font-semibold text-ink tabular-nums">{m.n}</span>
            </li>
          ))}
        </ul>
        <Link href="/servicos" className="mt-3 inline-block text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline">
          Ver serviços dos clientes
        </Link>
      </div>
    </div>
  );
}
