"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { BLOCKED, authErrorMessage, isUnconfirmed } from "@/lib/auth-errors";
import { PREVIEW_BLOCKED, requireClient } from "@/lib/client-auth";
import { getPortalPost } from "@/lib/data/client-area";
import { approveByClient, changesByClient, rejectByClient } from "@/lib/approval/client-approval";

// Ações da área do cliente (/cliente): conta (entrar, criar, senha) e decisões sobre os artigos.

export type ClientFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
      unconfirmed?: boolean;
      sent?: { email: string };
      ok?: string;
    }
  | undefined;

const MIN_PASSWORD = 8;
const emailSchema = z.email();
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const callbackUrl = (next: string) => `${env.appUrl}/auth/callback?next=${encodeURIComponent(next)}`;

function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > 72) return "Use até 72 caracteres na senha.";
  return null;
}

// ---------- Entrar ----------
export async function clientSignIn(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };
  const fieldErrors: Record<string, string> = {};
  if (!emailSchema.safeParse(email).success) fieldErrors.email = "Informe o e-mail que você usou no cadastro.";
  if (!password) fieldErrors.password = "Informe sua senha.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), unconfirmed: isUnconfirmed(error), values };

  try {
    const profile = await ensureProfile(data.user);
    if (profile.role !== "client") {
      await supabase.auth.signOut();
      return { error: "Este e-mail é de uma conta da equipe OutBox. Entre pelo CMS em cms.outboxgroup.com.br.", values };
    }
    if (profile.status === "blocked") {
      await supabase.auth.signOut();
      return { error: BLOCKED, values };
    }
  } catch {
    await supabase.auth.signOut();
    return { error: "Não foi possível carregar sua conta agora. Tente de novo em instantes.", values };
  }
  redirect("/cliente");
}

// ---------- Criar conta ----------
export async function clientSignUp(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const name = text(formData, "name").replace(/\s+/g, " ");
  const company = text(formData, "company").replace(/\s+/g, " ");
  const phone = text(formData, "phone");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { name, company, phone, email };

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Informe seu nome.";
  else if (name.length > 80) fieldErrors.name = "Use até 80 caracteres no nome.";
  if (company.length < 2) fieldErrors.company = "Informe o nome da sua empresa.";
  else if (company.length > 120) fieldErrors.company = "Use até 120 caracteres.";
  if (phone.replace(/\D/g, "").length < 10) fieldErrors.phone = "Informe o WhatsApp com DDD.";
  if (!emailSchema.safeParse(email).success) fieldErrors.email = "Informe um e-mail válido, como nome@suaempresa.com.br.";
  const pw = passwordError(password);
  if (pw) fieldErrors.password = pw;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl("/cliente"), data: { name, company, phone, area: "cliente" } },
  });
  if (error) {
    const message = authErrorMessage(error);
    const field = error.code === "weak_password" ? "password" : error.code?.startsWith("email") || error.code === "user_already_exists" ? "email" : null;
    return field ? { fieldErrors: { [field]: message }, values } : { error: message, values };
  }
  // Com "Confirm email" desligado o Supabase já devolve a sessão.
  if (data.session) redirect("/cliente");
  return { sent: { email }, values };
}

export async function clientResendConfirmation(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const email = text(formData, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success) return { error: "Informe o e-mail da conta para reenviar o link." };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl("/cliente") } });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return { error: authErrorMessage(error) };
  return { sent: { email } };
}

// ---------- Senha ----------
export async function clientRequestReset(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const email = text(formData, "email").toLowerCase();
  if (!emailSchema.safeParse(email).success) return { fieldErrors: { email: "Informe o e-mail da sua conta." }, values: { email } };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/cliente/nova-senha") });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) return { error: authErrorMessage(error), values: { email } };
  return { sent: { email }, values: { email } };
}

/** Senha nova a partir do link de recuperação (a sessão vem do link). */
export async function clientSetPassword(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const pw = passwordError(password);
  if (pw) return { fieldErrors: { password: pw } };
  if (confirm !== password) return { fieldErrors: { confirm: "As senhas não são iguais. Digite a mesma senha nos dois campos." } };
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/cliente/esqueci-senha?erro=link-expirado");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const message = authErrorMessage(error);
    return error.code === "weak_password" || error.code === "same_password" ? { fieldErrors: { password: message } } : { error: message };
  }
  redirect("/cliente");
}

export async function clientSignOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/cliente/entrar");
}

// ---------- Minha conta ----------
export async function saveClientAccount(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const { account, preview } = await requireClient();
  if (preview) return { error: PREVIEW_BLOCKED };
  const name = text(formData, "name").replace(/\s+/g, " ");
  const phone = text(formData, "phone");
  const values = { name, phone };
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) fieldErrors.name = "Informe seu nome (até 80 caracteres).";
  if (phone.replace(/\D/g, "").length < 10) fieldErrors.phone = "Informe o WhatsApp com DDD.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };
  const { error } = await db().from("profiles").update({ name, phone }).eq("id", account.id).eq("role", "client");
  if (error) return { error: "Não foi possível salvar agora. Tente de novo.", values };
  revalidatePath("/cliente", "layout");
  return { ok: "Dados salvos.", values };
}

export async function changeClientPassword(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const { account, preview } = await requireClient();
  if (preview) return { error: PREVIEW_BLOCKED };
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current) return { fieldErrors: { current: "Informe a senha atual." } };
  const pw = passwordError(password);
  if (pw) return { fieldErrors: { password: pw } };
  if (confirm !== password) return { fieldErrors: { confirm: "As senhas não são iguais." } };

  // confere a senha atual num cliente separado, sem mexer na sessão
  const check = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: account.email, password: current });
  if (wrong) return { fieldErrors: { current: "Senha atual incorreta." } };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const message = authErrorMessage(error);
    return { fieldErrors: { password: message } };
  }
  return { ok: "Senha alterada." };
}

// ---------- Artigos ----------
type Result = { ok: boolean; message: string };

async function guardPost(postId: string): Promise<{ clientId: string } | "preview" | null> {
  const { company, preview } = await requireClient();
  if (preview) return "preview";
  const post = await getPortalPost(company.id, postId);
  return post ? { clientId: company.id } : null;
}

function refreshArticle(postId: string) {
  revalidatePath("/cliente", "layout");
  revalidatePath(`/cliente/artigos/${postId}`);
  revalidatePath("/");
  revalidatePath(`/artigos/${postId}`);
}

const NOT_YOURS = "Este artigo não está mais disponível na sua área. Atualize a página.";

export async function approveArticle(postId: string): Promise<Result> {
  const g = await guardPost(postId);
  if (g === "preview") return { ok: false, message: PREVIEW_BLOCKED };
  if (!g) return { ok: false, message: NOT_YOURS };
  const r = await approveByClient(postId);
  refreshArticle(postId);
  return r;
}

export async function requestArticleChanges(postId: string, message: string): Promise<Result> {
  const g = await guardPost(postId);
  if (g === "preview") return { ok: false, message: PREVIEW_BLOCKED };
  if (!g) return { ok: false, message: NOT_YOURS };
  const r = await changesByClient(postId, message);
  refreshArticle(postId);
  return r;
}

export async function rejectArticle(postId: string, reason: string): Promise<Result> {
  const g = await guardPost(postId);
  if (g === "preview") return { ok: false, message: PREVIEW_BLOCKED };
  if (!g) return { ok: false, message: NOT_YOURS };
  const r = await rejectByClient(postId, reason);
  refreshArticle(postId);
  return r;
}

// ---------- Temas ----------
export async function suggestTopic(title: string, notes: string): Promise<Result> {
  const { account, company, preview } = await requireClient();
  if (preview) return { ok: false, message: PREVIEW_BLOCKED };
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length < 5) return { ok: false, message: "Escreva o tema do artigo em uma frase." };
  const { error } = await db()
    .from("client_topics")
    .insert({ client_id: company.id, title: t.slice(0, 200), notes: notes.trim().slice(0, 1500) || null, source: "cliente", created_by: account.id });
  if (error) return { ok: false, message: "Não foi possível enviar o tema. Tente de novo." };
  revalidatePath("/cliente", "layout");
  revalidatePath("/automacao");
  revalidatePath("/", "layout"); // contador do Painel da equipe
  return { ok: true, message: "Tema enviado. Ele entrou na fila e vira artigo para você aprovar." };
}

/** O cliente tira da fila um tema que ele mesmo mandou e ainda não virou artigo. */
export async function removeTopic(topicId: string): Promise<Result> {
  const { company, preview } = await requireClient();
  if (preview) return { ok: false, message: PREVIEW_BLOCKED };
  const { data } = await db()
    .from("client_topics")
    .delete()
    .eq("id", topicId)
    .eq("client_id", company.id)
    .eq("source", "cliente")
    .eq("status", "pending")
    .select("id");
  if (!data?.length) return { ok: false, message: "Este tema já virou artigo ou não está mais na fila." };
  revalidatePath("/cliente", "layout");
  revalidatePath("/automacao");
  revalidatePath("/", "layout"); // contador do Painel da equipe
  return { ok: true, message: "Tema retirado da fila." };
}
