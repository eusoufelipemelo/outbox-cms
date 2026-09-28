import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { loadSettings } from "@/lib/settings";
import { igAuthUrl, igConfigured } from "@/lib/instagram/oauth";
import { signState, verifyClientToken } from "@/lib/instagram/link";

/** Início da conexão do Instagram do cliente (link assinado, sem login no CMS). */
export async function GET(req: NextRequest) {
  await loadSettings();
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c) || !verifyClientToken(c, t)) {
    return new Response("Link de conexão inválido. Peça um novo link à OutBox.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!igConfigured()) {
    return new Response("A conexão com o Instagram ainda não está configurada. Avise a OutBox.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const nonce = randomBytes(12).toString("hex");
  (await cookies()).set("ig_nonce", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/instagram", maxAge: 900 });
  return NextResponse.redirect(igAuthUrl(signState(c, nonce)));
}
