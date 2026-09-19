/** Só caminhos internos: bloqueia "//host", "/\\host" e esquemas (redirecionamento aberto). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://cms.local");
    return url.origin === "http://cms.local" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
