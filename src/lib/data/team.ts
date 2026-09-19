import "server-only";
import { db } from "@/lib/supabase/admin";
import { PROFILE_COLUMNS } from "@/lib/auth";
import type { Profile, ProfileStatus } from "@/lib/types";

const STATUS_ORDER: Record<ProfileStatus, number> = { pending: 0, active: 1, blocked: 2 };

/** Equipe: aguardando aprovação primeiro (mais antigos antes), depois ativos e bloqueados por nome. */
export async function listTeam(): Promise<Profile[]> {
  const { data, error } = await db().from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: true });
  if (error) throw new Error(`Não foi possível carregar a equipe: ${error.message}`);
  const rows = (data ?? []) as Profile[];
  return rows.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus || a.status === "pending") return byStatus;
    return (a.name || a.email).localeCompare(b.name || b.email, "pt-BR");
  });
}

/** Contas esperando aprovação (selo na navegação dos admins). */
export async function countPendingProfiles(): Promise<number> {
  const { count, error } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? 0 : (count ?? 0);
}
