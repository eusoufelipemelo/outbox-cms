"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

const profileSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo.").max(80),
  job_title: z.string().trim().min(2, "Informe seu cargo ou função (ex.: Redatora, Designer).").max(60),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 13, "Informe o WhatsApp com DDD, ex.: (47) 99999-9999."),
  bio: z.string().trim().max(400, "Resuma em até 400 caracteres.").optional(),
});

/** Dados pessoais do perfil. A foto é enviada à parte (POST /api/avatar). */
export async function saveProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formData.get("name") ?? "",
    job_title: formData.get("job_title") ?? "",
    phone: formData.get("phone") ?? "",
    bio: formData.get("bio") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error) };

  const { error } = await db()
    .from("profiles")
    .update({ name: parsed.data.name, job_title: parsed.data.job_title, phone: parsed.data.phone, bio: parsed.data.bio || null })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível salvar o perfil. Tente de novo." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil salvo" };
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Informe um e-mail válido.") });

/** Troca o e-mail de acesso: o Supabase envia um link de confirmação (a troca só vale depois de confirmar). */
export async function changeEmail(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = emailSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) return { ok: false, error: "Confira o e-mail.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.email === user.email.toLowerCase()) {
    return { ok: false, error: "Esse já é o seu e-mail de acesso.", fieldErrors: { email: "Esse já é o seu e-mail de acesso." } };
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${env.appUrl}/auth/callback?next=/perfil` },
  );
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "Esse e-mail já pertence a outra conta."
      : /rate|limit|seconds/i.test(error.message)
        ? "Muitas tentativas seguidas. Espere alguns minutos e tente de novo."
        : "Não foi possível trocar o e-mail agora. Tente de novo.";
    return { ok: false, error: msg, fieldErrors: { email: msg } };
  }
  return {
    ok: true,
    message: `Enviamos um link de confirmação para ${parsed.data.email}. O e-mail só muda depois que você clicar nele (confira também a caixa de spam).`,
  };
}

const passwordSchema = z
  .object({
    current: z.string().optional(),
    password: z.string().min(8, "Use pelo menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não conferem." });

/** Troca (ou cria, para quem entrou com Google) a senha. Exige a senha atual quando existe. */
export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({
    current: formData.get("current") || undefined,
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Confira os campos destacados.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const providers = (data.user?.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword = providers.includes("email");

  if (hasPassword) {
    if (!parsed.data.current) return { ok: false, error: "Informe a senha atual.", fieldErrors: { current: "Informe a senha atual." } };
    // confere a senha atual num cliente separado, sem mexer na sessão
    const check = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
    if (wrong) return { ok: false, error: "Senha atual incorreta.", fieldErrors: { current: "Senha atual incorreta." } };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const msg = /same|different/i.test(error.message)
      ? "A nova senha precisa ser diferente da atual."
      : /weak|short|characters/i.test(error.message)
        ? "Senha fraca. Misture letras, números e símbolos."
        : "Não foi possível trocar a senha. Tente de novo.";
    return { ok: false, error: msg, fieldErrors: { password: msg } };
  }
  return { ok: true, message: hasPassword ? "Senha alterada" : "Senha criada. Agora você também pode entrar com e-mail e senha." };
}
