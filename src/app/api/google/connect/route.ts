import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { authUrl, oauthConfigured } from "@/lib/google/oauth";

/** Início do login da OutBox no Google (só administradores). */
export async function GET() {
  await requireAdmin();
  if (!oauthConfigured()) return NextResponse.redirect(`${env.appUrl}/google-empresas?erro=configuracao`);
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("gbp_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return NextResponse.redirect(authUrl(state));
}
