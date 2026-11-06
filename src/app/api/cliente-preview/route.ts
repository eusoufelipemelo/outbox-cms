import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { PREVIEW_COOKIE } from "@/lib/client-auth";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Modo "Ver como o cliente": administrador abre a área de um cliente sem poder decidir nada. */
export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user || user.role !== "admin" || user.status !== "active") return NextResponse.redirect(new URL("/login", req.url));

  if (req.nextUrl.searchParams.has("sair")) {
    const res = NextResponse.redirect(new URL("/area-do-cliente", req.url));
    res.cookies.delete(PREVIEW_COOKIE);
    return res;
  }

  const id = req.nextUrl.searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/area-do-cliente", req.url));
  const { data } = await db().from("clients").select("id").eq("id", id).neq("status", "archived").maybeSingle();
  if (!data) return NextResponse.redirect(new URL("/area-do-cliente", req.url));

  const res = NextResponse.redirect(new URL("/cliente", req.url));
  res.cookies.set(PREVIEW_COOKIE, id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  return res;
}
