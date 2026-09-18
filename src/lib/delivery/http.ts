import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "@/lib/env";

export const USER_AGENT = "OutBox-CMS/1.0";

/** Erro de entrega com mensagem pronta para o usuário (pt-BR). */
export class DeliveryError extends Error {
  statusCode: number | null;
  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.name = "DeliveryError";
    this.statusCode = statusCode;
  }
}

/** Resultado de um canal (WordPress, webhook, API) para um site. */
export type ChannelOutcome = {
  ok: boolean;
  statusCode: number | null;
  message: string;
  externalId?: string | null;
  externalUrl?: string | null;
};

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { code?: unknown; cause?: unknown };
  if (typeof e.code === "string") return e.code;
  if (e.cause && typeof e.cause === "object") {
    const c = e.cause as { code?: unknown; errors?: unknown };
    if (typeof c.code === "string") return c.code;
    if (Array.isArray(c.errors) && c.errors[0] && typeof c.errors[0] === "object") {
      const first = c.errors[0] as { code?: unknown };
      if (typeof first.code === "string") return first.code;
    }
  }
  return undefined;
}

/** Traduz falhas de rede do fetch em mensagens acionáveis. */
export function networkMessage(err: unknown, url: string, timeoutMs: number): string {
  const host = hostOf(url);
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return `${host} não respondeu em ${Math.round(timeoutMs / 1000)} s. Confira se o site está no ar e tente de novo.`;
  }
  const code = errorCode(err);
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Endereço ${host} não encontrado. Confira se a URL está correta.`;
    case "ECONNREFUSED":
      return `${host} recusou a conexão. O servidor pode estar fora do ar.`;
    case "ECONNRESET":
    case "UND_ERR_SOCKET":
      return `A conexão com ${host} foi interrompida. Tente de novo em instantes.`;
    case "UND_ERR_CONNECT_TIMEOUT":
    case "ETIMEDOUT":
      return `${host} não respondeu a tempo. Confira se o site está no ar.`;
    case "CERT_HAS_EXPIRED":
      return `O certificado SSL de ${host} expirou. Renove o certificado do site.`;
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return `O certificado SSL de ${host} é inválido. Corrija o HTTPS do site.`;
  }
  if (err instanceof TypeError && /invalid url/i.test(err.message)) return `URL inválida: ${url}`;
  const detail = code || (err instanceof Error ? err.message : String(err));
  return `Não foi possível conectar a ${host} (${detail}).`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loopback, redes privadas, link-local (metadados de nuvem), CGNAT, multicast e reservados. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (v6.startsWith("::ffff:")) return true;
  return /^(fc|fd|fe[89ab]|ff)/.test(v6);
}

/**
 * Proteção contra SSRF: URLs informadas pelo usuário (webhook, WordPress, capa) só podem
 * apontar para http(s) em endereço público. Desligável em desenvolvimento com OUTBOX_ALLOW_PRIVATE_URLS=1.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DeliveryError(`URL inválida: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DeliveryError(`Endereço não permitido (${url.protocol}). Use uma URL começando com https://.`);
  }
  if (env.allowPrivateUrls) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blocked = `${host} é um endereço interno. Use o endereço público do site.`;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new DeliveryError(blocked);
  }
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch (err) {
      throw new DeliveryError(networkMessage(err, raw, 0));
    }
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new DeliveryError(blocked);
  return url;
}

export type RequestOptions = RequestInit & {
  /** Tempo máximo por tentativa. Padrão: 10 s. */
  timeoutMs?: number;
  /** Novas tentativas em erro de rede, 429 ou 5xx. Padrão: 2. */
  retries?: number;
};

const MAX_REDIRECTS = 5;

/**
 * fetch com timeout e novas tentativas (backoff 0,5 s → 1,5 s) em erro de rede, 429 e 5xx.
 * O corpo precisa ser reutilizável (string, Buffer, Uint8Array). Lança DeliveryError em falha de rede.
 * Cada endereço (inclusive os de redirecionamento) passa por `assertPublicUrl`.
 */
export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const { redirect = "follow", ...rest } = options;
  const h = new Headers(rest.headers);
  let target = url;
  let method = (rest.method ?? "GET").toUpperCase();
  let body = rest.body;

  for (let hop = 0; ; hop++) {
    const current = await assertPublicUrl(target);
    const res = await fetchWithRetry(current.toString(), { ...rest, method, body, headers: h, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (redirect !== "follow" || !location) return res;

    await res.body?.cancel().catch(() => {});
    if (hop >= MAX_REDIRECTS) throw new DeliveryError(`${hostOf(url)} redirecionou vezes demais. Confira a URL.`);
    const next = new URL(location, current);
    // credenciais não seguem para outro host nem para http
    if (next.host !== current.host || (current.protocol === "https:" && next.protocol === "http:")) h.delete("authorization");
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = undefined;
      h.delete("content-type");
    }
    target = next.toString();
  }
}

async function fetchWithRetry(url: string, options: RequestOptions): Promise<Response> {
  const { timeoutMs = 10_000, retries = 2, headers, ...init } = options;
  const h = new Headers(headers);
  if (!h.has("user-agent")) h.set("user-agent", USER_AGENT);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: h,
        redirect: init.redirect ?? "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await res.body?.cancel().catch(() => {});
        await sleep(500 * 3 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await sleep(500 * 3 ** attempt);
        continue;
      }
      throw new DeliveryError(networkMessage(err, url, timeoutMs));
    }
  }
}

/** Lê o corpo como texto (limitado) e tenta interpretar como JSON. */
export async function readBody(res: Response, max = 200_000): Promise<{ text: string; json: unknown }> {
  let text = "";
  try {
    text = (await res.text()).slice(0, max);
  } catch {
    text = "";
  }
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { text, json };
}

/** Trecho curto e legível de uma resposta (HTML vira texto). */
export function snippet(text: string, max = 140): string {
  const clean = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Executa `fn` sobre os itens com no máximo `limit` em paralelo, preservando a ordem. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
