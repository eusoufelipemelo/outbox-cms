import "server-only";
import type { NextRequest } from "next/server";
import { getSiteByKey, getSiteByDomain, type ContentSite } from "@/lib/content";

// Utilitários HTTP da Content API pública (CORS aberto, cache curto, erros em pt-BR).

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-OutBox-Key",
  "Access-Control-Max-Age": "86400",
};

/** Cache curto na CDN para a publicação aparecer quase na hora. */
export const PUBLIC_CACHE = "public, max-age=0, s-maxage=15, stale-while-revalidate=60";

function headers(extra: Record<string, string> = {}, cache = PUBLIC_CACHE): Headers {
  return new Headers({ ...CORS_HEADERS, "Cache-Control": cache, Vary: "Authorization, X-OutBox-Key", ...extra });
}

export function json(data: unknown, init: { status?: number; cache?: string } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: headers({ "Content-Type": "application/json; charset=utf-8" }, init.cache),
  });
}

export function xml(body: string, contentType = "application/xml; charset=utf-8"): Response {
  return new Response(body, { status: 200, headers: headers({ "Content-Type": contentType }) });
}

/** Texto puro (llms.txt, llms-full.txt), com o mesmo CORS e cache da API. */
export function text(body: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, { status: 200, headers: headers({ "Content-Type": contentType, "X-Content-Type-Options": "nosniff" }) });
}

export function apiError(status: number, message: string): Response {
  return json({ error: message }, { status, cache: "no-store" });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: headers({}, "public, max-age=86400") });
}

/** Chave pública do site: `?key=`, `x-outbox-key` ou `Authorization: Bearer`. */
export function readKey(req: NextRequest): string {
  const fromQuery = req.nextUrl.searchParams.get("key");
  if (fromQuery) return fromQuery.trim();
  const fromHeader = req.headers.get("x-outbox-key");
  if (fromHeader) return fromHeader.trim();
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return "";
}

/** Domínio do site: `?site=cliente.com.br` (ou `?domain=`) ou cabeçalho `x-outbox-site`. */
export function readDomain(req: NextRequest): string {
  const q = req.nextUrl.searchParams;
  return (q.get("site") || q.get("domain") || req.headers.get("x-outbox-site") || "").trim();
}

/**
 * Identifica o site pelo domínio (jeito padrão dos sites OutBox) ou pela chave pública
 * (integrações antigas). Retorna o site ou a resposta de erro pronta.
 */
export async function authSite(req: NextRequest): Promise<{ site: ContentSite; error?: never } | { site?: never; error: Response }> {
  const key = readKey(req);
  const domain = key ? "" : readDomain(req);
  if (!key && !domain) {
    return { error: apiError(400, "Informe o domínio do site em ?site=cliente.com.br.") };
  }
  try {
    const site = key ? await getSiteByKey(key) : await getSiteByDomain(domain);
    if (!site) {
      return key
        ? { error: apiError(401, "Chave pública inválida. Copie a chave correta na página do site no OutBox CMS.") }
        : { error: apiError(404, `O domínio ${domain} não está cadastrado no OutBox CMS. Cadastre o site do cliente com esse domínio.`) };
    }
    if (site.status !== "active") return { error: apiError(403, "Este site está pausado no OutBox CMS.") };
    return { site };
  } catch (err) {
    console.error("[api/v1] falha ao validar chave:", err);
    return { error: apiError(500, "Erro interno ao validar a chave. Tente de novo em instantes.") };
  }
}

/** Envolve o handler com tratamento de erro genérico. */
export async function safely(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error("[api/v1]", err);
    return apiError(500, "Erro interno ao buscar os artigos. Tente de novo em instantes.");
  }
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function siteInfo(site: ContentSite) {
  return { name: site.name, url: site.url };
}
