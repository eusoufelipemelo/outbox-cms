"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/data/sites";
import type { ActionResult, Profile, ProfileRole } from "@/lib/types";

export type TeamChange = "approve" | "block" | "make_admin" | "make_editor" | "make_writer";

const CHANGES: TeamChange[] = ["approve", "block", "make_admin", "make_editor", "make_writer"];
// Bloqueio também vale no Supabase Auth: a conta não consegue renovar a sessão.
const BAN_FOREVER = "876000h";

async function otherActiveAdmins(exceptId: string): Promise<number> {
  const { count } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("status", "active")
    .neq("id", exceptId);
  return count ?? 0;
}

export async function updateTeamMember(id: string, change: TeamChange): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isUuid(id) || !CHANGES.includes(change)) return { ok: false, error: "Pedido inválido. Recarregue a página e tente de novo." };
  if (id === me.id) return { ok: false, error: "Você não pode mudar a própria conta. Peça a outro administrador." };

  const { data } = await db().from("profiles").select("id, role, status").eq("id", id).maybeSingle();
  const target = data as Pick<Profile, "id" | "role" | "status"> | null;
  if (!target) return { ok: false, error: "Esta pessoa não está mais na equipe. Recarregue a página." };

  const losesAdmin =
    target.role === "admin" && target.status === "active" && (change === "block" || change === "make_editor" || change === "make_writer");
  if (losesAdmin && (await otherActiveAdmins(id)) < 1) {
    return { ok: false, error: "A equipe precisa de pelo menos um administrador ativo." };
  }

  let patch: Partial<Profile>;
  let message: string;
  switch (change) {
    case "approve":
      patch = { status: "active", approved_at: new Date().toISOString(), approved_by: me.id };
      message = target.status === "blocked" ? "Acesso reativado" : "Acesso aprovado";
      break;
    case "block":
      patch = { status: "blocked" };
      message = target.status === "pending" ? "Pedido recusado" : "Conta bloqueada";
      break;
    case "make_admin":
      if (target.status !== "active") return { ok: false, error: "Aprove a conta antes de torná-la administradora." };
      patch = { role: "admin" };
      message = "Agora é administrador";
      break;
    case "make_editor":
      patch = { role: "editor" };
      message = "Agora é editor";
      break;
    case "make_writer":
      patch = { role: "writer" };
      message = "Agora é redator";
      break;
  }

  const { error } = await db().from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, error: `Não foi possível salvar a mudança: ${error.message}` };

  if (change === "block") await db().auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
  if (change === "approve" && target.status === "blocked") await db().auth.admin.updateUserById(id, { ban_duration: "none" });

  revalidatePath("/equipe");
  revalidatePath("/", "layout");
  return { ok: true, message };
}

/** Remove a pessoa do CMS (apaga a conta). Os artigos que ela escreveu continuam. */
export async function removeTeamMember(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "Pedido inválido. Recarregue a página e tente de novo." };
  if (id === me.id) return { ok: false, error: "Você não pode remover a própria conta. Peça a outro administrador." };
  const { data } = await db().from("profiles").select("id, role, status").eq("id", id).maybeSingle();
  const target = data as Pick<Profile, "id" | "role" | "status"> | null;
  if (!target) return { ok: true, message: "Pessoa removida" };
  if (target.role === "admin" && target.status === "active" && (await otherActiveAdmins(id)) < 1) {
    return { ok: false, error: "A equipe precisa de pelo menos um administrador ativo." };
  }
  const { error } = await db().auth.admin.deleteUser(id);
  if (error) return { ok: false, error: `Não foi possível remover: ${error.message}` };
  revalidatePath("/equipe");
  revalidatePath("/", "layout");
  return { ok: true, message: "Pessoa removida" };
}

const inviteSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome da pessoa.").max(80),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  role: z.enum(["admin", "editor", "writer"]),
});

export type InviteResult = ActionResult<{ link: string; name: string; email: string }>;

/**
 * Cadastra alguém na equipe já aprovado, com a função escolhida, e devolve um link de convite
 * para o administrador mandar (WhatsApp ou e-mail). No link, a pessoa cria a senha e entra.
 */
export async function inviteTeamMember(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  const me = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "editor",
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Confira os campos destacados.", fieldErrors: fe };
  }
  const { name, email, role } = parsed.data;

  const { data, error } = await db().auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name }, redirectTo: `${env.appUrl}/auth/callback?next=/redefinir-senha` },
  });
  if (error || !data?.user || !data.properties?.hashed_token) {
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return exists
      ? { ok: false, error: "Esse e-mail já tem conta no CMS.", fieldErrors: { email: "Esse e-mail já tem conta no CMS. Veja a lista abaixo." } }
      : { ok: false, error: `Não foi possível gerar o convite: ${error?.message ?? "erro desconhecido"}` };
  }

  // o gatilho do banco cria o perfil como "aguardando": aqui ele já nasce aprovado e com a função certa
  const patch: Partial<Profile> & { role: ProfileRole } = {
    name,
    email,
    role,
    status: "active",
    approved_at: new Date().toISOString(),
    approved_by: me.id,
  };
  await db().from("profiles").upsert({ id: data.user.id, ...patch }, { onConflict: "id" });

  const link = `${env.appUrl}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite&next=${encodeURIComponent("/redefinir-senha")}`;
  revalidatePath("/equipe");
  return { ok: true, data: { link, name, email }, message: "Convite criado" };
}
