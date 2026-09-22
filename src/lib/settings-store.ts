/**
 * Espelho em memória das configurações do Painel administrativo.
 * Fica separado do resto para `env` poder ler sem depender do banco (evita import circular).
 */

let snapshot: Record<string, string> = {};

export function setSnapshot(values: Record<string, string>): void {
  snapshot = values;
}

export function snapshotValues(): Record<string, string> {
  return snapshot;
}

/** Valor do painel, com a variável do servidor como reserva. */
export function pick(key: string, fallback?: string | null): string | null {
  const fromPanel = snapshot[key]?.trim();
  if (fromPanel) return fromPanel;
  const fromEnv = fallback?.trim();
  return fromEnv || null;
}
