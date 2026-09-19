import "server-only";
import { isIP } from "node:net";
import { assertPublicUrl, networkMessage, request } from "./http";

// IndexNow: avisa Bing, Yandex, Seznam, Naver (e os mecanismos de resposta que usam o índice do Bing)
// que uma URL mudou. O site precisa servir a chave em {url}/{chave}.txt.
// Nunca derruba a entrega: devolve só um complemento para a mensagem do resultado.

const ENDPOINT = "https://api.indexnow.org/indexnow";
const TIMEOUT_MS = 5_000;
const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

export type IndexNowSite = { url: string; indexnow_key: string | null };

/** Hosts que nunca são avisados (desenvolvimento, rede interna). */
function isInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || isIP(host)) return true;
  return host === "localhost" || /\.(localhost|local|internal|test|example|invalid)$/.test(host);
}

/**
 * Envia as URLs ao IndexNow. Retorna o texto a acrescentar na mensagem da entrega
 * (" IndexNow avisado." no sucesso) ou "" quando o aviso não se aplica.
 */
export async function notifyIndexNow(site: IndexNowSite, urls: (string | null | undefined)[]): Promise<string> {
  const key = site.indexnow_key?.trim();
  if (!key || !KEY_RE.test(key)) return "";

  let base: URL;
  try {
    base = new URL(site.url);
  } catch {
    return "";
  }
  if (isInternalHost(base.hostname)) return "";
  try {
    await assertPublicUrl(base.toString());
  } catch {
    return "";
  }

  // O IndexNow só aceita URLs do mesmo host da chave.
  const urlList = [
    ...new Set(
      urls.filter((u): u is string => {
        if (!u) return false;
        try {
          const parsed = new URL(u);
          return parsed.host === base.host && /^https?:$/.test(parsed.protocol);
        } catch {
          return false;
        }
      }),
    ),
  ];
  if (!urlList.length) return "";

  const root = site.url.replace(/\/+$/, "");
  try {
    const res = await request(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ host: base.host, key, keyLocation: `${root}/${key}.txt`, urlList }),
      headers: { "content-type": "application/json; charset=utf-8" },
      timeoutMs: TIMEOUT_MS,
      retries: 0,
    });
    await res.body?.cancel().catch(() => {});
    if (res.status === 200 || res.status === 202) return " IndexNow avisado.";
    if (res.status === 403) return ` IndexNow recusou a chave: o site precisa servir o arquivo /${key}.txt.`;
    if (res.status === 422) return " IndexNow recusou os endereços (HTTP 422).";
    if (res.status === 429) return " IndexNow pediu uma pausa nos avisos (HTTP 429).";
    return ` IndexNow não confirmou o aviso (HTTP ${res.status}).`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : networkMessage(err, ENDPOINT, TIMEOUT_MS);
    console.error("[indexnow]", detail);
    return " IndexNow não respondeu.";
  }
}
