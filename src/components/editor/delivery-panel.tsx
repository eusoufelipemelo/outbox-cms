"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, hostname } from "@/lib/utils";
import { ClientDot, Dialog } from "./primitives";
import type { DestinationSite, PublishResult } from "./types";

const STAGGER_MS = 120;

export interface DeliveryState {
  /** Muda a cada rodada (publicar, tentar de novo) para reiniciar a sequência. */
  round: number;
  siteIds: string[];
  event: "publish" | "update";
  /** null enquanto o servidor entrega. */
  results: PublishResult[] | null;
  /** Falha antes da entrega (validação, rede). */
  error: string | null;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * O único momento coreografado do produto: cada destino acende em sequência
 * (aguardando, depois no ar ou falhou) assim que a entrega termina.
 */
export function DeliveryPanel({
  state,
  sites,
  onClose,
  onRetry,
}: {
  state: DeliveryState | null;
  sites: DestinationSite[];
  onClose: () => void;
  onRetry: (siteIds: string[]) => void;
}) {
  const [progress, setProgress] = useState({ round: -1, count: 0 });
  const results = state?.results ?? null;
  const round = state?.round ?? -1;
  const revealed = progress.round === round ? progress.count : 0;
  const rowCount = state?.siteIds.length ?? 0;

  useEffect(() => {
    if (!results) return;
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setProgress({ round, count: rowCount }), 0);
      return () => clearTimeout(t);
    }
    const timers = Array.from({ length: rowCount }, (_, i) =>
      setTimeout(() => setProgress({ round, count: i + 1 }), STAGGER_MS * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, [results, round, rowCount]);

  const open = state !== null;
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = (state?.siteIds ?? []).map((siteId, index) => {
    const found = results?.find((r) => r.siteId === siteId) ?? null;
    const site = siteById.get(siteId);
    // resposta ausente para um site conta como falha
    const result: PublishResult | null =
      found ??
      (results
        ? { siteId, siteName: site?.name ?? "Site", ok: false, channel: site?.platform ?? "api", url: null, message: "O site não confirmou a entrega. Tente de novo." }
        : null);
    const shown = result !== null && index < revealed;
    return { siteId, site, result, shown };
  });

  const done = results !== null && revealed >= rowCount;
  const okCount = rows.filter((r) => r.result?.ok).length;
  const failed = rows.filter((r) => r.result && !r.result.ok).map((r) => r.siteId);
  const total = state?.siteIds.length ?? 0;
  const verb = state?.event === "update" ? "Atualizado" : "Publicado";
  const siteWord = (n: number) => (n === 1 ? "site" : "sites");

  const title = state?.error
    ? "A publicação não começou"
    : !done
      ? `${state?.event === "update" ? "Atualizando" : "Publicando"} em ${total} ${siteWord(total)}`
      : okCount === 0
        ? "Não foi possível publicar"
        : `${verb} em ${okCount} de ${total} ${siteWord(total)}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={done || Boolean(state?.error)}
      title={<span aria-live="polite">{title}</span>}
      description={
        state?.error
          ? undefined
          : done
            ? failed.length
              ? "Veja o motivo em cada site com falha e tente de novo."
              : "O artigo já está disponível nos sites abaixo."
            : "Cada site confirma a entrega assim que recebe o artigo."
      }
      footer={
        <>
          {done && failed.length ? (
            <Button variant="secondary" onClick={() => onRetry(failed)}>
              Tentar de novo em {failed.length} {siteWord(failed.length)}
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={!done && !state?.error}>
            {done || state?.error ? "Fechar" : "Aguarde"}
          </Button>
        </>
      }
    >
      {state?.error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Destinos">
          {rows.map(({ siteId, site, result, shown }) => {
            const ok = shown && result?.ok;
            const bad = shown && result && !result.ok;
            const href = result?.url ?? null;
            return (
              <li
                key={siteId}
                className={cn(
                  "rounded-[var(--radius-control)] border px-3 py-3 transition-[background-color,border-color] duration-300 ease-out",
                  ok ? "border-ok/30 bg-ok-soft" : bad ? "border-danger/30 bg-danger-soft" : "border-line bg-surface",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-out",
                      ok ? "scale-100 bg-ok text-white" : bad ? "scale-100 bg-danger text-white" : "scale-90 bg-sunken text-muted",
                    )}
                  >
                    {ok ? <Check className="size-4" strokeWidth={3} /> : bad ? <X className="size-4" strokeWidth={3} /> : <LoaderCircle className="size-4 animate-spin" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <ClientDot color={site?.client.brand_color ?? null} />
                      <span className="truncate text-sm font-medium text-ink">{site?.name ?? result?.siteName ?? "Site"}</span>
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {site ? hostname(site.url) : ""}
                      <span className="sr-only">
                        {ok ? ", no ar" : bad ? ", falhou" : ", enviando"}
                      </span>
                    </span>
                  </span>
                  {ok && href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink underline-offset-4 hover:underline"
                    >
                      Abrir no site
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
                {bad ? <p className="mt-2 pl-10 text-[13px] text-danger">{result?.message}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
