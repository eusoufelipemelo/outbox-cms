import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import type { ChangeRequest } from "@/lib/data/approvals";
import { formatDateTime } from "@/lib/utils";

/** Recados dos clientes pedindo ajuste em artigos: o primeiro bloco do Painel quando há algum. */
export function ChangeRequests({ items }: { items: ChangeRequest[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6 rounded-[var(--radius-panel)] border border-warn/40 bg-warn-soft" aria-labelledby="pedidos-clientes">
      <h2 id="pedidos-clientes" className="flex items-center gap-2 px-4 pt-4 text-[16px] font-semibold text-ink sm:px-5">
        <MessageSquareWarning className="size-[18px] text-warn" aria-hidden />
        {items.length === 1 ? "1 cliente pediu ajustes" : `${items.length} pedidos de ajuste dos clientes`}
      </h2>
      <ul className="mt-2 divide-y divide-warn/20">
        {items.map((it) => (
          <li key={it.postId} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] text-ink">
                <span className="font-semibold">{it.clientName}</span>
                <span className="text-muted"> sobre </span>
                <span className="font-medium">{it.title}</span>
              </p>
              <p className="mt-1 line-clamp-3 text-[14px] whitespace-pre-wrap text-text">{it.feedback ? `“${it.feedback}”` : "Ainda sem recado escrito."}</p>
              {it.at ? <p className="mt-1 text-[12.5px] text-muted">{formatDateTime(it.at)}</p> : null}
            </div>
            <Link
              href={`/artigos/${it.postId}`}
              className="inline-flex h-8 shrink-0 items-center rounded-[var(--radius-control)] bg-ink px-3 text-[13px] font-medium text-on-ink hover:bg-ink-hover"
            >
              Abrir e ajustar
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
