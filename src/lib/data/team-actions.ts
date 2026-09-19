"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/data/sites";
import type { ActionResult, Profile } from "@/lib/types";

export type TeamChange = "approve" | "block" | "make_admin" | "make_editor";

const CHANGES: TeamChange[] = ["approve", "block", "make_admin", "make_editor"];
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
    target.role === "admin" && target.status === "active" && (change === "block" || change === "make_editor");
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
  }

  const { error } = await db().from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, error: `Não foi possível salvar a mudança: ${error.message}` };

  if (change === "block") await db().auth.admin.updateUserById(id, { ban_duration: BAN_FOREVER });
  if (change === "approve" && target.status === "blocked") await db().auth.admin.updateUserById(id, { ban_duration: "none" });

  revalidatePath("/equipe");
  revalidatePath("/", "layout");
  return { ok: true, message };
}
