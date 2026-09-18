// Datas de calendário no fuso da agência (America/Sao_Paulo).
// Um "dia" é sempre uma chave "YYYY-MM-DD" no horário de Brasília.

export const TZ = "America/Sao_Paulo";

const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
const monthNameFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long" });
const dayLongFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const dayMonthFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" });

/** Chave do dia (YYYY-MM-DD) em Brasília. */
export function dayKey(value: string | Date): string {
  return keyFmt.format(new Date(value));
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Deslocamento de Brasília (ex.: "-03:00") no instante informado. */
function offsetAt(date: Date): string {
  const part = offsetFmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT-03:00";
  const m = part.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-03:00";
}

/** Instante UTC da meia-noite de Brasília do dia informado. */
export function startOfDay(key: string): Date {
  const guess = new Date(`${key}T12:00:00Z`);
  return new Date(`${key}T00:00:00${offsetAt(guess)}`);
}

/** Soma dias a uma chave, devolvendo outra chave. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dias inteiros entre duas chaves (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** 0 = segunda ... 6 = domingo. */
export function weekdayMondayFirst(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function timeLabel(value: string | Date): string {
  return timeFmt.format(new Date(value));
}

/** "setembro de 2026" */
export function monthLabel(month: string): string {
  return monthFmt.format(new Date(`${month}-15T12:00:00Z`));
}

export function monthName(month: string): string {
  return monthNameFmt.format(new Date(`${month}-15T12:00:00Z`));
}

/** "sexta-feira, 18 de setembro" */
export function dayLongLabel(key: string): string {
  return dayLongFmt.format(new Date(`${key}T12:00:00Z`));
}

/** "18 de setembro" */
export function dayMonthLabel(key: string): string {
  return dayMonthFmt.format(new Date(`${key}T12:00:00Z`));
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export const WEEKDAYS_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
export const WEEKDAYS_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
