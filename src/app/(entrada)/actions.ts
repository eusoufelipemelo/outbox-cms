"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { BLOCKED, GOOGLE_DISABLED, authErrorMessage, isUnconfirmed } from "@/lib/auth-errors";

// Todas as chamadas ao Supabase Auth acontecem no servidor (PKCE: o verificador fica em cookie).

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Valores devolvidos para o formulário não perder o que foi digitado. */
      values?: { email?: string; name?: string };
      /** Login recusado por e-mail não confirmado: oferece reenviar o link. */
      unconfirmed?: boolean;
      /** Envio concluído (cadastro, redefinição, reenvio). */
      sent?: { email: string };
    }
  | undefined;

const MIN_PASSWORD = 8;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function callbackUrl(next: string, extra = ""): string {
  return `${env.appUrl}/auth/callback?next=${encodeURIComponent(next)}${extra}`;
}

const emailSchema = z.email({ error: "Informe um e-mail válido, como nome@empresa.com.br." });

// ---------- Entrar com e-mail ----------
export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(text(formData, "next"));
  const values = { email };

  const fieldErrors: Record<string, string> = {};
  if (!emailSchema.safeParse(email).success) fieldErrors.email = "Informe um e-mail válido, como nome@empresa.com.br.";
  if (!password) fieldErrors.password = "Informe sua senha.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), unconfirmed: isUnconfirmed(error), values };

  let status: string;
  try {
    status = (await ensureProfile(data.user)).status;
  } catch {
    await supabase.auth.signOut();
    return { error: "Não foi possível carregar sua conta agora. Tente de novo em instantes.", values };
  }
  if (status === "blocked") {
    await supabase.auth.signOut();
    return { error: BLOCKED, values };
  }
  redirect(status === "pending" ? "/aguardando-aprovacao" : next);
}

// ---------- Google ----------
let googleCache: { at: number; enabled: boolean } | null = null;

/** Lê /auth/v1/settings (público) para não mandar a pessoa a uma página de erro do Supabase. */
async function googleEnabled(): Promise<boolean> {
  if (googleCache && Date.now() - googleCache.at < 60_000) return googleCache.enabled;
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabaseAnonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return true;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    const enabled = json.external?.google !== false;
    googleCache = { at: Date.now(), enabled };
    return enabled;
  } catch {
    return true; // na dúvida, tenta: o callback trata o erro
  }
}

export async function signInWithGoogle(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(text(formData, "next"));
  if (!(await googleEnabled())) return { error: GOOGLE_DISABLED };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl(next, "&via=google"),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return { error: authErrorMessage(error) };
  redirect(data.url);
}

// ---------- Criar conta ----------
export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = text(formData, "name").replace(/\s+/g, " ");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email, name };

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Informe seu nome, como a equipe conhece você.";
  if (name.length > 80) fieldErrors.name = "Use até 80 caracteres no nome.";
  if (!emailSchema.safeParse(email).success) fieldErrors.email = "Informe um e-mail válido, como nome@empresa.com.br.";
  if (password.length < MIN_PASSWORD) fieldErrors.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  else if (password.length > 72) fieldErrors.password = "Use até 72 caracteres na senha.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl("/"), data: { name } },
  });
  if (error) {
    const message = authErrorMessage(error);
    const field = error.code === "weak_password" ? "password" : error.code?.startsWith("email") || error.code === "user_already_exists" ? "email" : null;
    return field ? { fieldErrors: { [field]: message }, values } : { error: message, values };
  }
  // Com "Confirm email" desligado o Supabase já devolve a sessão.
  if (data.session) redirect("/aguardando-aprovacao");
  return { sent: { email }, values };
}

// ---------- Reenviar confirmação ----------
export async function resendConfirmation(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success) return { error: "Informe o e-mail da conta para reenviar o link.", values: { email } };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl("/") } });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return { error: authErrorMessage(error), values: { email } };
  return { sent: { email }, values: { email } };
}

// ---------- Esqueci minha senha ----------
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { fieldErrors: { email: "Informe um e-mail válido, como nome@empresa.com.br." }, values: { email } };
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/redefinir-senha") });
  // Mesma resposta exista ou não a conta; só limite de envio é informado.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return { error: authErrorMessage(error), values: { email } };
  return { sent: { email }, values: { email } };
}

// ---------- Redefinir senha (sessão aberta pelo link de recuperação) ----------
export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (password.length < MIN_PASSWORD) fieldErrors.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  else if (password.length > 72) fieldErrors.password = "Use até 72 caracteres na senha.";
  if (!fieldErrors.password && confirm !== password) fieldErrors.confirm = "As senhas não são iguais. Digite a mesma senha nos dois campos.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/esqueci-senha?erro=link-expirado");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const message = authErrorMessage(error);
    return error.code === "weak_password" || error.code === "same_password" ? { fieldErrors: { password: message } } : { error: message };
  }
  redirect("/");
}

// ---------- Sair ----------
export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
