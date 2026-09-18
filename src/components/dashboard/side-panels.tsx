import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { dayKey, dayLongLabel, timeLabel, todayKey, addDays } from "@/components/agenda/dates";
import type { DraftItem, FailureItem, TopReadItem, UpcomingItem } from "@/lib/data/dashboard";

function SidePanel({
  title,
  action,
  children,
  className,
  tone,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "danger";
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-panel)] border bg-surface",
        tone === "danger" ? "border-danger/40" : "border-line",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className={cn("flex items-center gap-2 text-[15px] font-semibold", tone === "danger" ? "text-danger" : "text-ink")}>
          {tone === "danger" ? <AlertTriangle className="size-4" aria-hidden /> : null}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="px-5 pb-4 text-sm text-muted">{children}</p>;
}

const rowLink = "block px-5 py-2.5 transition-colors hover:bg-sunken focus-visible:bg-sunken";

export function AttentionPanel({ failures, total, className }: { failures: FailureItem[]; total: number; className?: string }) {
  if (!failures.length) {
    return (
      <SidePanel title="Precisa de atenção" className={className}>
        <p className="flex items-center gap-2 px-5 pb-4 text-sm text-muted">
          <CheckCircle2 className="size-4 text-ok" aria-hidden />
          Nenhuma entrega com falha.
        </p>
      </SidePanel>
    );
  }
  return (
    <SidePanel
      title="Precisa de atenção"
      tone="danger"
      className={className}
      action={total > failures.length ? <span className="text-[13px] text-muted">{total} falhas no total</span> : null}
    >
      <ul className="pb-2">
        {failures.map((f) => (
          <li key={f.id}>
            <Link href={`/artigos/${f.postId}`} className={rowLink}>
              <p className="line-clamp-1 text-[14px] font-medium text-ink">{f.postTitle}</p>
              <p className="text-[13px] text-muted">
                Falhou em <span className="text-text">{f.siteName}</span>
                {f.clientName ? ` (${f.clientName})` : ""}, {relativeTime(f.at)}
              </p>
              {f.message ? <p className="mt-1 line-clamp-2 text-[13px] text-danger">{f.message}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </SidePanel>
  );
}

function dayHeading(iso: string) {
  const key = dayKey(iso);
  const today = todayKey();
  if (key === today) return "Hoje";
  if (key === addDays(today, 1)) return "Amanhã";
  const label = dayLongLabel(key);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function destinations(names: string[]) {
  if (!names.length) return "Nenhum destino escolhido";
  if (names.length <= 2) return names.join(" e ");
  return `${names[0]} e mais ${names.length - 1} sites`;
}

export function UpcomingPanel({ items, className }: { items: UpcomingItem[]; className?: string }) {
  return (
    <SidePanel
      title="Próximos 7 dias"
      className={className}
      action={
        <Link href="/agenda" className="text-[13px] font-medium text-muted hover:text-ink">
          Abrir agenda
        </Link>
      }
    >
      {items.length ? (
        <ul className="pb-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/artigos/${p.id}`} className={cn(rowLink, "grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3")}>
                <span className="pt-px text-[13px] font-semibold text-info tabular-nums">{timeLabel(p.scheduledAt)}</span>
                <span className="min-w-0">
                  <span className="line-clamp-1 text-[14px] font-medium text-ink">{p.title}</span>
                  <span className="block text-[13px] text-muted">
                    {dayHeading(p.scheduledAt)}, {destinations(p.siteNames)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Nada agendado para esta semana. Agende um artigo para manter os blogs ativos sem depender do dia a dia.</Quiet>
      )}
    </SidePanel>
  );
}

export function DraftsPanel({ items, className }: { items: DraftItem[]; className?: string }) {
  return (
    <SidePanel
      title="Rascunhos em andamento"
      className={className}
      action={
        <Link href="/artigos?status=draft" className="text-[13px] font-medium text-muted hover:text-ink">
          Ver todos
        </Link>
      }
    >
      {items.length ? (
        <ul className="pb-2">
          {items.map((d) => (
            <li key={d.id}>
              <Link href={`/artigos/${d.id}`} className={rowLink}>
                <p className="line-clamp-1 text-[14px] font-medium text-ink">{d.title}</p>
                <p className="text-[13px] text-muted">
                  Editado {relativeTime(d.updatedAt)},{" "}
                  {d.destinations === 0 ? "sem destino" : d.destinations === 1 ? "1 destino" : `${d.destinations} destinos`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>Nenhum rascunho aberto. Tudo o que foi escrito já saiu ou está agendado.</Quiet>
      )}
    </SidePanel>
  );
}

const views = new Intl.NumberFormat("pt-BR");

export function TopReadPanel({ items, className }: { items: TopReadItem[]; className?: string }) {
  const max = items[0]?.views ?? 0;
  return (
    <SidePanel title="Mais lidos em 30 dias" className={className}>
      {items.length ? (
        <ol className="pb-2">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/artigos/${t.id}`} className={rowLink}>
                <p className="line-clamp-1 text-[14px] font-medium text-ink">{t.title}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-ink/70" style={{ width: `${Math.max(4, (t.views / max) * 100)}%` }} />
                  </span>
                  <span className="shrink-0 text-[13px] text-muted tabular-nums">
                    {views.format(t.views)} {t.views === 1 ? "leitura" : "leituras"}, {t.sites === 1 ? "1 site" : `${t.sites} sites`}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <Quiet>As leituras aparecem aqui quando os sites exibirem artigos pela Content API ou pelo embed.</Quiet>
      )}
    </SidePanel>
  );
}
