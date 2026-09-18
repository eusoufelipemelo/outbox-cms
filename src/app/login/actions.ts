"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha incorretos." };

  redirect(safeNext(next));
}

/** Só caminhos internos: bloqueia "//host", "/\\host" e esquemas (redirecionamento aberto). */
function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next)) return "/";
  try {
    const url = new URL(next, "http://cms.local");
    return url.origin === "http://cms.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
