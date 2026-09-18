import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { AgendaList, MonthGrid, type CalendarDay } from "@/components/agenda/calendar";
import { ClientFilter } from "@/components/agenda/client-filter";
import { addDays, isMonthKey, monthLabel, monthName, shiftMonth, todayKey, weekdayMondayFirst } from "@/components/agenda/dates";
import type { AgendaPost } from "@/components/agenda/types";
import { getAgendaPosts, getClientOptions, isUuid } from "./data";

export const metadata: Metadata = { title: "Agenda" };

function href(month: string | null, cliente: string | undefined) {
  const qs = new URLSearchParams();
  if (month) qs.set("m", month);
  if (cliente) qs.set("cliente", cliente);
  const s = qs.toString();
  return s ? `/agenda?${s}` : "/agenda";
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayKey();
  const currentMonth = today.slice(0, 7);
  const month = isMonthKey(sp.m) ? sp.m : currentMonth;
  const cliente = isUuid(sp.cliente) ? sp.cliente : undefined;

  // Grade de segunda a domingo cobrindo o mês inteiro.
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridStart = addDays(first, -weekdayMondayFirst(first));
  const gridEnd = addDays(last, 7 - weekdayMondayFirst(last)); // exclusivo
  const days: CalendarDay[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push({ key: d, inMonth: d.startsWith(month) });

  const [posts, clients] = await Promise.all([getAgendaPosts(gridStart, gridEnd, cliente), getClientOptions()]);
  const byDay = new Map<string, AgendaPost[]>();
  for (const p of posts) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);

  const inMonth = posts.filter((p) => p.day.startsWith(month));
  const scheduled = inMonth.filter((p) => p.kind === "scheduled").length;
  const published = inMonth.length - scheduled;
  const clientName = cliente ? clients.find((c) => c.id === cliente)?.name : undefined;
  const label = monthLabel(month);

  let summary: string;
  if (!inMonth.length) {
    summary = `Nenhum artigo agendado ou publicado em ${monthName(month)}${clientName ? ` para ${clientName}` : ""}.`;
  } else {
    const parts = [
      published ? `${published} ${published === 1 ? "publicado" : "publicados"}` : null,
      scheduled ? `${scheduled} ${scheduled === 1 ? "agendado" : "agendados"}` : null,
    ].filter(Boolean);
    summary = `${parts.join(" e ")} em ${monthName(month)}${clientName ? ` para ${clientName}` : ""}.`;
  }

  return (
    <>
      <PageHeader title="Agenda" description="Artigos agendados e publicados por dia, no horário de Brasília." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3">
          <h2 className="display min-w-0 text-[22px] first-letter:uppercase sm:text-[26px]" aria-live="polite">
            {label}
          </h2>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <nav aria-label="Navegar entre meses" className="flex items-center gap-1">
            <Link href={href(shiftMonth(month, -1), cliente)} aria-label="Mês anterior" className={buttonClass("secondary", "icon")}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link
              href={href(null, cliente)}
              aria-current={month === currentMonth ? "date" : undefined}
              className={buttonClass("secondary", "md")}
            >
              Hoje
            </Link>
            <Link href={href(shiftMonth(month, 1), cliente)} aria-label="Próximo mês" className={buttonClass("secondary", "icon")}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </nav>
          <ClientFilter
            basePath="/agenda"
            params={{ m: month === currentMonth ? undefined : month }}
            clients={clients}
            value={cliente ?? ""}
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <p className="text-muted">{summary}</p>
        <ul className="flex items-center gap-4 text-[13px] text-muted" aria-label="Legenda">
          <li className="flex items-center gap-1.5">
            <StatusDot tone="info" /> Agendado
          </li>
          <li className="flex items-center gap-1.5">
            <StatusDot tone="ok" /> Publicado
          </li>
          <li className="hidden items-center gap-1.5 md:flex">O número no fim indica quantos sites recebem o artigo</li>
        </ul>
      </div>

      <div className="hidden md:block">
        <MonthGrid days={days} today={today} posts={byDay} />
      </div>
      <div className="md:hidden">
        <AgendaList month={month} today={today} posts={posts} />
      </div>
    </>
  );
}
