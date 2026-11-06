"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const BAN_FOREVER = "876000h";
const uuid = z.uuid();

function refresh() {
  revalidatePath("/area-do-cliente");
  revalidatePath("/servicos");
}

async function clientExists(clientId: string): Promise<boolean> {
  if (!uuid.safeParse(clientId).success) return false;
  const { data } = await db().from("clients").select("id").eq("id", clientId).neq("status", "archived").maybeSingle();
  return Boolean(data);
}

async function clientAccount(id: string): Promise<{ id: string; status: string } | null> {
  if (!uuid.safeParse(id).success) return null;
  const { data } = await db().from("profiles").select("id, status").eq("id", id).eq("role", "client").maybeSingle();
  return (data as { id: string; status: string } | null) ?? null;
}

/** Libera o cadastro para uma empresa: a pessoa passa a ver os artigos e temas dela. */
export async function grantClientAccess(accountId: string, clientId: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const account = await clientAccount(accountId);
  if (!account) return { ok: false, error: "Este cadastro não existe mais. Recarregue a página." };
  if (!(await clientExists(clientId))) return { ok: false, error: "Escolha a empresa do cliente." };
  const { error } = await db()
    .from("profiles")
    .update({ status: "active", client_id: clientId, approved_at: new Date().toISOString(), approved_by: user.id })
    .eq("id", accountId)
    .eq("role", "client");
  if (error) return { ok: false, error: "Não foi possível liberar agora. Tente de novo." };
  if (account.status === "blocked") await db().auth.admin.updateUserById(accountId, { ban_duration: "none" });
  refresh();
  return { ok: true, message: "Acesso liberado" };
}

/** Bloqueia o acesso (cadastro recusado ou pessoa que saiu da empresa). A conta continua guardada. */
export async function blockClientAccess(accountId: string): Promise<ActionResult> {
  await requireAdmin();
  const account = await clientAccount(accountId);
  if (!account) return { ok: false, error: "Este cadastro não existe mais. Recarregue a página." };
  const { error } = await db().from("profiles").update({ status: "blocked" }).eq("id", accountId).eq("role", "client");
  if (error) return { ok: false, error: "Não foi possível bloquear agora. Tente de novo." };
  await db().auth.admin.updateUserById(accountId, { ban_duration: BAN_FOREVER });
  refresh();
  return { ok: true, message: "Acesso bloqueado" };
}

/** Libera um e-mail antes do cadastro: quem se cadastrar com ele (e confirmar) entra direto. */
export async function inviteClientEmail(email: string, clientId: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const e = email.trim().toLowerCase();
  if (!z.email().safeParse(e).success) return { ok: false, error: "Informe um e-mail válido." };
  if (!(await clientExists(clientId))) return { ok: false, error: "Escolha a empresa do cliente." };

  // já tem conta? libera na hora
  const { data: existing } = await db().from("profiles").select("id, role, status").eq("email", e).maybeSingle();
  const prof = existing as { id: string; role: string; status: string } | null;
  if (prof && prof.role !== "client") return { ok: false, error: "Este e-mail é de uma conta da equipe." };
  if (prof) return grantClientAccess(prof.id, clientId);

  const { error } = await db().from("client_invites").upsert({ email: e, client_id: clientId, created_by: user.id }, { onConflict: "email" });
  if (error) return { ok: false, error: "Não foi possível liberar o e-mail agora." };
  refresh();
  return { ok: true, message: "E-mail liberado. Mande o link para o cliente se cadastrar." };
}

export async function removeClientInvite(email: string): Promise<ActionResult> {
  await requireAdmin();
  await db().from("client_invites").delete().eq("email", email.trim().toLowerCase());
  refresh();
  return { ok: true, message: "Liberação removida" };
}
