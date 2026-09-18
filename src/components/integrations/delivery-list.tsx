import Link from "next/link";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/panel";
import type { DeliveryChannel, DeliveryEvent } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { ResendButton } from "./resend-button";

export type DeliveryRow = {
  id: string;
  post_id: string | null;
  site_id: string | null;
  channel: DeliveryChannel;
  event: DeliveryEvent;
  ok: boolean;
  status_code: number | null;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
  post: { id: string; title: string } | null;
  site: { id: string; name: string; client_id: string; client: { name: string } | null } | null;
};

const EVENT_LABEL: Record<DeliveryEvent, string> = {
  publish: "Publicação",
  update: "Atualização",
  unpublish: "Despublicação",
  test: "Teste de conexão",
};

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  api: "Content API",
  wordpress: "WordPress",
  webhook: "Webhook",
};

function duration(ms: number | null): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export function DeliveryFilter({ failedOnly, siteParam }: { failedOnly: boolean; siteParam: string | null }) {
  const href = (failed: boolean) => {
    const p = new URLSearchParams();
    if (siteParam) p.set("site", siteParam);
    if (failed) p.set("entregas", "falhas");
    const qs = p.toString();
    return `/integracoes${qs ? `?${qs}` : ""}#entregas`;
  };
  const item = (label: string, active: boolean, to: string) => (
    <Link
      href={to}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-[var(--radius-chip)] border px-4 text-[13.5px] transition-colors",
        active ? "border-ink bg-ink font-medium text-white" : "border-line-strong text-muted hover:border-ink hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Filtrar entregas" className="flex items-center gap-2">
      {item("Todas", !failedOnly, href(false))}
      {item("Com falha", failedOnly, href(true))}
    </nav>
  );
}

export function DeliveryList({ rows, failedOnly }: { rows: DeliveryRow[]; failedOnly: boolean }) {
  if (!rows.length) {
    return (
      <EmptyState
        title={failedOnly ? "Nenhuma falha recente" : "Nenhuma entrega ainda"}
        description={
          failedOnly
            ? "Todas as entregas recentes deram certo."
            : "Publique um artigo ou teste a conexão de um site: cada envio aparece aqui com o resultado."
        }
        action={
          failedOnly ? undefined : (
            <Link href="/artigos/novo" className="text-sm font-medium text-ink underline underline-offset-4">
              Escrever um artigo
            </Link>
          )
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((d) => {
        const canResend = !d.ok && d.post && d.site && (d.event === "publish" || d.event === "update");
        const time = duration(d.duration_ms);
        return (
          <li key={d.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
            <div className="shrink-0 sm:w-[112px]">
              <Badge tone={d.ok ? "ok" : "danger"}>
                <StatusDot tone={d.ok ? "ok" : "danger"} />
                {d.ok ? "Entregue" : "Falhou"}
              </Badge>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-ink">
                {d.post ? (
                  <Link href={`/artigos/${d.post.id}`} className="hover:underline hover:underline-offset-4">
                    {d.post.title || "Artigo sem título"}
                  </Link>
                ) : (
                  EVENT_LABEL[d.event]
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
                <span>{d.post ? EVENT_LABEL[d.event] : CHANNEL_LABEL[d.channel]}</span>
                {d.site ? (
                  <Link href={`/clientes/${d.site.client_id}/sites/${d.site.id}`} className="hover:text-ink hover:underline">
                    {d.site.name}
                    {d.site.client ? <span className="text-faint"> de {d.site.client.name}</span> : null}
                  </Link>
                ) : (
                  <span>Site removido</span>
                )}
                {d.status_code ? <span>HTTP {d.status_code}</span> : null}
                {time ? <span>{time}</span> : null}
              </p>
              {d.message ? <p className={cn("mt-1.5 text-[13px] leading-relaxed", d.ok ? "text-muted" : "text-danger")}>{d.message}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
              <time dateTime={d.created_at} title={formatDateTime(d.created_at)} className="text-[12.5px] whitespace-nowrap text-faint">
                {relativeTime(d.created_at)}
              </time>
              {canResend ? <ResendButton postId={d.post!.id} siteId={d.site!.id} siteName={d.site!.name} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
