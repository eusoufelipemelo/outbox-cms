import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { finishLiLogin } from "@/lib/linkedin/oauth";

/** Retorno do login na LinkedIn: confere o state e guarda a autorização. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const jar = await cookies();
  const expected = jar.get("li_state")?.value;
  jar.delete({ name: "li_state", path: "/api/linkedin" });
  const { searchParams } = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/linkedin?${q}`);

  const error = searchParams.get("error");
  if (error) return back(error === "unauthorized_scope_error" ? "erro=escopo" : "erro=negado");
  const code = searchParams.get("code");
  if (!code || !expected || searchParams.get("state") !== expected) return back("erro=estado");
  try {
    await finishLiLogin(code);
    return back("conectado=1");
  } catch (err) {
    console.error("[linkedin] login:", err instanceof Error ? err.message : err);
    return back("erro=token");
  }
}
