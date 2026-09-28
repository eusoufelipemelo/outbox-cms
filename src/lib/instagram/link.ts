import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Link de conexão assinado por cliente: o cliente abre sem login no CMS, e ninguém forja o de outro. */

function sign(value: string): string {
  return createHmac("sha256", `outbox-ig:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).update(value).digest("base64url").slice(0, 32);
}

export function igConnectLink(clientId: string): string {
  return `${env.appUrl}/api/instagram/connect?c=${clientId}&t=${sign(clientId)}`;
}

export function verifyClientToken(clientId: string, token: string): boolean {
  const a = Buffer.from(sign(clientId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signState(clientId: string, nonce: string): string {
  return `${clientId}.${nonce}.${sign(`${clientId}.${nonce}`)}`;
}

export function readState(state: string): { clientId: string; nonce: string } | null {
  const [clientId, nonce, mac] = state.split(".");
  if (!clientId || !nonce || !mac) return null;
  const a = Buffer.from(sign(`${clientId}.${nonce}`));
  const b = Buffer.from(mac);
  return a.length === b.length && timingSafeEqual(a, b) ? { clientId, nonce } : null;
}
