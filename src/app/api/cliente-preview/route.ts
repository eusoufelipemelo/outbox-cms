import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { PREVIEW_COOKIE } from "@/lib/client-auth";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

// Atrás do proxy, req.url aponta para o endereço interno (0.0.0.0:3000): redireciona sempre para o endereço público.
const to = (path: string) => NextResponse.redirect(new URL(path, env.appUrl));

export const dynamic = "force-dynamic";

/** Modo "Ver como o cliente": administrador abre a área de um cliente sem poder decidir nada. */
export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user || user.role !== "admin" || user.status !== "active") return to("/login");

  if (req.nextUrl.searchParams.has("sair")) {
    const res = to("/area-do-cliente");
    res.cookies.delete(PREVIEW_COOKIE);
    return res;
  }

  const id = req.nextUrl.searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return to("/area-do-cliente");
  const { data } = await db().from("clients").select("id").eq("id", id).neq("status", "archived").maybeSingle();
  if (!data) return to("/area-do-cliente");

  const res = to("/cliente");
  res.cookies.set(PREVIEW_COOKIE, id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  return res;
}
