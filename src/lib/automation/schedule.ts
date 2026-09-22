/** Ritmo da automação: dias da semana e horário, sempre no fuso de Brasília. */

export const TZ = "America/Sao_Paulo";
export const WEEKDAYS = [
  { value: 1, short: "seg", label: "segunda" },
  { value: 2, short: "ter", label: "terça" },
  { value: 3, short: "qua", label: "quarta" },
  { value: 4, short: "qui", label: "quinta" },
  { value: 5, short: "sex", label: "sexta" },
  { value: 6, short: "sáb", label: "sábado" },
  { value: 0, short: "dom", label: "domingo" },
] as const;

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Data/hora em Brasília de um instante. */
function inTz(date: Date) {
  const map: Record<string, string> = {};
  for (const p of parts.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WD[map.weekday] ?? 0,
  };
}

/** Offset de Brasília (em minutos) naquele instante — sempre -180 desde 2019, mas medido, não suposto. */
function offsetMinutes(date: Date): number {
  const t = inTz(date);
  const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Instante UTC correspondente a uma data e hora de Brasília. */
function fromTz(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
}

/**
 * Próxima execução: o primeiro dia da semana escolhido, no horário escolhido, depois de `from`.
 * Se a automação publica menos vezes do que os dias marcados permitem, o intervalo mínimo entre
 * execuções (em dias) espaça as datas para caber a quantidade combinada no mês.
 */
export function nextRunAt(input: { weekdays: number[]; hour: number; perMonth: number }, from: Date = new Date()): Date {
  const days = [...new Set(input.weekdays.filter((d) => d >= 0 && d <= 6))].sort();
  if (!days.length) days.push(2);
  const minGapDays = Math.max(1, Math.floor(30 / Math.max(1, input.perMonth)) - 2);
  const start = new Date(from.getTime() + minGapDays * 86_400_000);
  const t = inTz(start);
  for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(t.year, t.month - 1, t.day + i, 12));
    const d = inTz(day);
    if (!days.includes(d.weekday)) continue;
    const when = fromTz(d.year, d.month, d.day, input.hour);
    if (when.getTime() > from.getTime()) return when;
  }
  return new Date(from.getTime() + 7 * 86_400_000);
}

/** "quarta, 9h" ou "seg e qui, 14h" */
export function rhythmLabel(input: { weekdays: number[]; hour: number; perMonth: number }): string {
  const names = WEEKDAYS.filter((w) => input.weekdays.includes(w.value)).map((w) => w.short);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "—");
  return `${input.perMonth} por mês, ${list}, ${input.hour}h`;
}
