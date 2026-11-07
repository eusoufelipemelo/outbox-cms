import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { SuggestedTopic } from "@/lib/data/approvals";
import { formatDateTime } from "@/lib/utils";

/** Temas que os clientes mandaram pela área do cliente: ficam aqui até virarem artigo ou saírem da fila. */
export function SuggestedTopics({ items }: { items: SuggestedTopic[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6 rounded-[var(--radius-panel)] border border-line bg-surface" aria-labelledby="temas-clientes">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <h2 id="temas-clientes" className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Lightbulb className="size-[18px] text-info" aria-hidden />
          {items.length === 1 ? "1 tema pedido por cliente" : `${items.length} temas pedidos por clientes`}
        </h2>
        <p className="text-[13px] text-muted">Somem daqui quando viram artigo ou saem da fila.</p>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {items.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] text-ink">
                <span className="font-semibold">{t.clientName}</span>
                <span className="text-muted"> sugeriu </span>
                <span className="font-medium">{t.title}</span>
              </p>
              {t.notes ? <p className="mt-1 line-clamp-3 text-[14px] whitespace-pre-wrap text-text">“{t.notes}”</p> : null}
              <p className="mt-1 text-[12.5px] text-muted">
                {t.author ? `${t.author}, ` : ""}
                {formatDateTime(t.at)}
              </p>
            </div>
            <Link
              href={`/automacao?cliente=${t.clientId}#temas`}
              className="inline-flex h-8 shrink-0 items-center rounded-[var(--radius-control)] bg-ink px-3 text-[13px] font-medium text-on-ink hover:bg-ink-hover"
            >
              Abrir fila de temas
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
