import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { finishLogin } from "@/lib/google/oauth";

/** Retorno do login no Google: confere o state e guarda a autorização. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const jar = await cookies();
  const expected = jar.get("gbp_state")?.value;
  jar.delete({ name: "gbp_state", path: "/api/google" });
  const { searchParams } = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/google-empresas?${q}`);

  if (searchParams.get("error")) return back("erro=negado");
  const code = searchParams.get("code");
  if (!code || !expected || searchParams.get("state") !== expected) return back("erro=estado");
  try {
    await finishLogin(code);
    return back("conectado=1");
  } catch (err) {
    console.error("[google] login:", err instanceof Error ? err.message : err);
    return back("erro=token");
  }
}
