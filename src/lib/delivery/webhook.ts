import "server-only";
import { createHmac } from "node:crypto";
import type { DeliveryEvent, Site } from "@/lib/types";
import { DeliveryError, readBody, request, snippet, type ChannelOutcome } from "./http";

export type WebhookSite = Pick<Site, "id" | "name" | "url" | "webhook_url" | "webhook_secret">;

/** `sha256=<hex HMAC-SHA256(secret, rawBody)>` */
export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/**
 * POST JSON `{ event, sent_at, site, post }` assinado com o `webhook_secret` do site.
 * 2xx = sucesso. Se a resposta trouxer `{ "url": "https://..." }`, ela vira a URL externa do artigo.
 */
export async function sendWebhook(site: WebhookSite, event: DeliveryEvent, post: unknown): Promise<ChannelOutcome> {
  if (!site.webhook_url) {
    throw new DeliveryError("Configure a URL do webhook na página do site para receber os artigos.");
  }
  let target: URL;
  try {
    target = new URL(site.webhook_url);
    if (!/^https?:$/.test(target.protocol)) throw new Error();
  } catch {
    throw new DeliveryError(`URL do webhook inválida: ${site.webhook_url}`);
  }

  const raw = JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    site: { id: site.id, name: site.name, url: site.url },
    post,
  });

  const res = await request(target.toString(), {
    method: "POST",
    body: raw,
    timeoutMs: 10_000,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-outbox-event": event,
      "x-outbox-signature": signPayload(site.webhook_secret, raw),
    },
  });
  const { text, json } = await readBody(res, 20_000);

  if (res.ok) {
    const url = json && typeof json === "object" && "url" in json ? (json as { url: unknown }).url : null;
    return {
      ok: true,
      statusCode: res.status,
      message: `Webhook recebido pelo site (HTTP ${res.status}).`,
      externalUrl: typeof url === "string" && /^https?:\/\//.test(url) ? url : null,
    };
  }

  const detail = snippet(text);
  let hint = "";
  if (res.status === 401 || res.status === 403) hint = " Confira se o site valida a assinatura com o segredo correto.";
  else if (res.status === 404) hint = " Confira a URL do webhook.";
  else if (res.status >= 500) hint = " O endpoint do site está com erro.";
  return {
    ok: false,
    statusCode: res.status,
    message: `O webhook respondeu HTTP ${res.status}.${hint}${detail ? ` Resposta: ${detail}` : ""}`,
  };
}
