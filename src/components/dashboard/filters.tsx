import Link from "next/link";
import { PERIODS, type Period } from "@/lib/data/analytics";
import { ClientFilter } from "@/components/agenda/client-filter";
import { cn } from "@/lib/utils";

/** Filtros do painel numa linha só: período e cliente. Valem para tudo que está abaixo. */
export function DashboardFilters({
  period,
  clientId,
  clients,
}: {
  period: Period;
  clientId: string;
  clients: { id: string; name: string }[];
}) {
  const href = (p: Period) => {
    const q = new URLSearchParams();
    if (p !== 30) q.set("periodo", String(p));
    if (clientId) q.set("cliente", clientId);
    const qs = q.toString();
    return qs ? `/?${qs}` : "/";
  };
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <nav aria-label="Período" className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-1">
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={href(p)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center rounded-lg px-3 text-[13px] transition-colors duration-150",
                active ? "bg-ink font-semibold text-on-ink" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              {p} dias
            </Link>
          );
        })}
      </nav>
      <ClientFilter
        basePath="/"
        params={{ periodo: period !== 30 ? String(period) : undefined }}
        clients={clients}
        value={clientId}
      />
    </div>
  );
}
