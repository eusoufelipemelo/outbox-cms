// Datas do editor sempre no horário de Brasília (America/Sao_Paulo).
// O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo em -03:00.

const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO → "YYYY-MM-DDTHH:mm" (valor de <input type="datetime-local">) em Brasília. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:mm" em Brasília → ISO com fuso. */
export function localInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const date = new Date(`${local}:00${OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "YYYY-MM-DD" (parâmetro ?data=) → valor inicial às 9h. */
export function dateParamToLocalInput(value: string | undefined | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return `${value}T09:00`;
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
