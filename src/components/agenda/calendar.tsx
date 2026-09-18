import Link from "next/link";
import { CalendarPlus, Plus } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, dayLongLabel, dayMonthLabel, timeLabel } from "./dates";
import type { AgendaPost } from "./types";

const KIND = {
  scheduled: { label: "Agendado", verb: "Agendado para", tone: "info" as const, time: "text-info", chip: "bg-info-soft text-info hover:border-info/40" },
  published: { label: "Publicado", verb: "Publicado às", tone: "ok" as const, time: "text-ok", chip: "bg-ok-soft text-ok hover:border-ok/40" },
};

function sites(n: number) {
  if (n === 0) return "sem destino";
  return n === 1 ? "1 site" : `${n} sites`;
}

function newHref(day: string) {
  return `/artigos/novo?data=${day}`;
}

function Chip({ post }: { post: AgendaPost }) {
  const k = KIND[post.kind];
  const description = `${k.verb} ${timeLabel(post.at)}, ${sites(post.destinations)}`;
  return (
    <li>
      <Link
        href={`/artigos/${post.id}`}
        title={`${post.title}. ${description}`}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-[3px] text-[12px] leading-tight font-medium transition-colors",
          k.chip,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{post.title}</span>
        <span aria-hidden className="shrink-0 tabular-nums opacity-80">
          {post.destinations}
        </span>
        <span className="sr-only">
          . {k.label}, {description}
        </span>
      </Link>
    </li>
  );
}

export type CalendarDay = { key: string; inMonth: boolean };

/** Grade mensal (segunda a domingo), a partir de 768px. */
export function MonthGrid({ days, today, posts }: { days: CalendarDay[]; today: string; posts: Map<string, AgendaPost[]> }) {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-line">
            {WEEKDAYS_SHORT.map((d, i) => (
              <th key={d} scope="col" className="px-2.5 py-2 text-left text-[13px] font-medium text-muted">
                <abbr title={WEEKDAYS_LONG[i]} className="no-underline">
                  {d}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].key} className="border-b border-line last:border-b-0">
              {week.map((day) => {
                const isToday = day.key === today;
                const past = day.key < today;
                const items = posts.get(day.key) ?? [];
                const n = Number(day.key.slice(8));
                return (
                  <td
                    key={day.key}
                    className={cn(
                      "group h-32 border-l border-line p-1.5 align-top first:border-l-0",
                      past && "bg-sunken",
                      !day.inMonth && !past && "bg-paper/40",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums",
                          isToday ? "font-bold text-ink ring-2 ring-ink" : past || !day.inMonth ? "text-faint" : "text-text",
                        )}
                      >
                        <span className="sr-only">{dayLongLabel(day.key)}</span>
                        <span aria-hidden>{n}</span>
                        {isToday ? <span className="sr-only"> (hoje)</span> : null}
                      </span>
                      {!past ? (
                        <Link
                          href={newHref(day.key)}
                          aria-label={`Novo artigo para ${dayMonthLabel(day.key)}`}
                          title={`Novo artigo para ${dayMonthLabel(day.key)}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
                        >
                          <Plus className="size-4" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                    {items.length ? (
                      <ul className="space-y-1">
                        {items.map((p) => (
                          <Chip key={`${p.kind}-${p.id}`} post={p} />
                        ))}
                      </ul>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista por dia, abaixo de 768px. */
export function AgendaList({ month, today, posts }: { month: string; today: string; posts: AgendaPost[] }) {
  const inMonth = posts.filter((p) => p.day.startsWith(month));
  if (!inMonth.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-5 py-8">
        <p className="text-[16px] font-semibold text-ink">Nenhum artigo neste mês</p>
        <p className="text-sm text-muted">Agende artigos para manter os blogs dos clientes com conteúdo novo.</p>
        <Link href="/artigos/novo" className={buttonClass("primary", "md")}>
          <CalendarPlus className="size-4" aria-hidden />
          Escrever artigo
        </Link>
      </div>
    );
  }
  const groups = new Map<string, AgendaPost[]>();
  for (const p of inMonth) groups.set(p.day, [...(groups.get(p.day) ?? []), p]);
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([day, items]) => {
        const label = dayLongLabel(day);
        const past = day < today;
        return (
          <section key={day} aria-labelledby={`dia-${day}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id={`dia-${day}`} className={cn("text-[14px] font-semibold", past ? "text-muted" : "text-ink")}>
                {label.charAt(0).toUpperCase() + label.slice(1)}
                {day === today ? <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] ring-2 ring-ink">hoje</span> : null}
              </h3>
              {!past ? (
                <Link href={newHref(day)} className="inline-flex h-10 items-center gap-1 px-1 text-[13px] font-medium text-muted hover:text-ink">
                  <Plus className="size-4" aria-hidden />
                  Novo artigo
                </Link>
              ) : null}
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
              {items.map((p) => {
                const k = KIND[p.kind];
                return (
                  <li key={`${p.kind}-${p.id}`}>
                    <Link href={`/artigos/${p.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken">
                      <span className={cn("w-11 shrink-0 pt-px text-[13px] font-semibold tabular-nums", k.time)}>{timeLabel(p.at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[14.5px] font-medium text-ink">{p.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                          <Badge tone={k.tone}>
                            <StatusDot tone={k.tone} />
                            {k.label}
                          </Badge>
                          {sites(p.destinations)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
