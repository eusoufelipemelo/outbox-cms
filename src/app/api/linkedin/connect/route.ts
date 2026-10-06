import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { liAuthUrl, liConfigured } from "@/lib/linkedin/oauth";

/** Início do login da OutBox na LinkedIn (só administradores). */
export async function GET() {
  await requireAdmin();
  if (!liConfigured()) return NextResponse.redirect(`${env.appUrl}/linkedin?erro=configuracao`);
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("li_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/linkedin", maxAge: 600 });
  return NextResponse.redirect(liAuthUrl(state));
}
