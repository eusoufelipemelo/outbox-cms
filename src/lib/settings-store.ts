/**
 * Espelho em memória das configurações do Painel administrativo.
 * Fica separado do resto para `env` poder ler sem depender do banco (evita import circular).
 * O valor mora em globalThis: páginas e rotas de API são empacotadas separadamente pelo Next,
 * e uma variável de módulo comum teria uma cópia (desatualizada) em cada pacote.
 */

const g = globalThis as typeof globalThis & { __outboxSettingsSnapshot?: Record<string, string> };

export function setSnapshot(values: Record<string, string>): void {
  g.__outboxSettingsSnapshot = values;
}

export function snapshotValues(): Record<string, string> {
  return g.__outboxSettingsSnapshot ?? {};
}

/** Valor do painel, com a variável do servidor como reserva. */
export function pick(key: string, fallback?: string | null): string | null {
  const fromPanel = snapshotValues()[key]?.trim();
  if (fromPanel) return fromPanel;
  const fromEnv = fallback?.trim();
  return fromEnv || null;
}
