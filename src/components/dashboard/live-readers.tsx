"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

// Leituras ao vivo: quem está com um artigo aberto agora, por site.
// O painel busca os dados a cada 15s e pausa quando a aba sai da frente.

const REFRESH_MS = 15_000;

type SiteLive = { siteId: string; name: string; color: string | null; now: number; visitors: number; reads: number };
type Live = { now: number; visitors: number; sites: SiteLive[]; minutes: number[]; windowMin: number };

const nf = new Intl.NumberFormat("pt-BR");

/** Barras dos últimos 30 minutos (sinais recebidos por minuto). */
function Pulse({ minutes }: { minutes: number[] }) {
  const max = Math.max(1, ...minutes);
  return (
    <div aria-hidden className="flex h-10 items-end gap-[3px]">
      {minutes.map((v, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-t-[2px]", v ? "bg-chart" : "bg-line")}
          style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : "2px" }}
        />
      ))}
    </div>
  );
}

export function LiveReaders() {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/painel/ao-vivo", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Live);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await load();
      timer.current = setTimeout(tick, REFRESH_MS);
    };
    void tick();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const total = data?.now ?? 0;
  const active = data?.sites.filter((s) => s.now > 0) ?? [];
  const recent = data?.sites.filter((s) => s.now === 0 && s.visitors > 0) ?? [];

  return (
    <Panel
      title="Leituras ao vivo"
      description={`Quem está com um artigo aberto agora. Atualiza sozinho; a linha mostra os últimos ${data?.windowMin ?? 30} minutos.`}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[34px] leading-none font-bold tracking-tight text-ink">
            <span className="relative flex size-2.5">
              {total > 0 ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-70" /> : null}
              <span className={cn("relative inline-flex size-2.5 rounded-full", total > 0 ? "bg-ok" : "bg-line-strong")} />
            </span>
            {nf.format(total)}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {total === 1 ? "pessoa lendo agora" : "pessoas lendo agora"}
            {data && data.visitors > total ? `, ${nf.format(data.visitors)} nos últimos ${data.windowMin} min` : ""}
          </p>
        </div>
        <div className="w-1/2 max-w-[220px]">{data ? <Pulse minutes={data.minutes} /> : null}</div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {!data && !error ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">Não foi possível atualizar agora. Tentando de novo em instantes.</p> : null}
        {data && active.length === 0 && recent.length === 0 ? (
          <p className="text-sm text-muted">
            Ninguém lendo neste momento. Os números aparecem aqui assim que alguém abrir um artigo em um dos sites.
          </p>
        ) : null}

        {active.length ? (
          <ul className="space-y-2.5">
            {active.map((s) => (
              <li key={s.siteId} className="flex items-center gap-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color || "var(--color-chart)" }} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-text">{s.name}</span>
                <span className="shrink-0 text-[14.5px] font-semibold text-ink tabular-nums">{nf.format(s.now)}</span>
                <span className="w-24 shrink-0 text-right text-[12.5px] text-muted">
                  {s.visitors > s.now ? `${nf.format(s.visitors)} em ${data?.windowMin} min` : "agora"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {recent.length ? (
          <p className="mt-3 text-[13px] text-muted">
            Leram nos últimos {data?.windowMin} minutos: {recent.map((s) => `${s.name} (${nf.format(s.visitors)})`).join(", ")}.
          </p>
        ) : null}

        <p className="mt-4 text-[12.5px] text-muted">
          Só contam sites com o blog OutBox instalado.{" "}
          <Link href="/clientes" className="font-medium text-ink underline underline-offset-4">
            Ver sites
          </Link>
        </p>
      </div>
    </Panel>
  );
}
