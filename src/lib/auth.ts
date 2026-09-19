import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { Profile, ProfileRole, ProfileStatus } from "@/lib/types";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: ProfileRole;
  status: ProfileStatus;
  avatarUrl: string | null;
};

export const PROFILE_COLUMNS = "id, email, name, avatar_url, role, status, created_at, approved_at, approved_by";

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function emailDomain(email: string): string {
  return email.split("@").pop()?.toLowerCase() ?? "";
}

/**
 * Perfil da conta (tabela `profiles`). O gatilho do banco cria o perfil no cadastro;
 * aqui cobrimos contas antigas sem perfil e a aprovação automática por domínio
 * (`AUTO_APPROVE_DOMAINS`), que só vale para e-mail confirmado.
 */
export async function ensureProfile(user: User): Promise<Profile> {
  const { data, error } = await db().from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (error) {
    throw new Error(
      `Não foi possível carregar o perfil da conta (${error.message}). Rode supabase/migrations/003_profiles.sql no Supabase.`,
    );
  }
  let profile = data as Profile | null;

  if (!profile) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const { count } = await db().from("profiles").select("id", { count: "exact", head: true });
    const first = count === 0;
    const { data: created, error: insertError } = await db()
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? "",
          name: metaString(meta, "name", "full_name"),
          avatar_url: metaString(meta, "avatar_url", "picture"),
          role: first ? "admin" : "editor",
          status: first ? "active" : "pending",
          approved_at: first ? new Date().toISOString() : null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (insertError) throw new Error(`Não foi possível criar o perfil da conta: ${insertError.message}`);
    profile = (created as Profile | null) ?? null;
    if (!profile) {
      const { data: again } = await db().from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single();
      profile = again as Profile;
    }
  }

  const confirmed = Boolean(user.email_confirmed_at);
  if (profile.status === "pending" && confirmed && user.email && env.autoApproveDomains.includes(emailDomain(user.email))) {
    const { data: approved } = await db()
      .from("profiles")
      .update({ status: "active", approved_at: new Date().toISOString() })
      .eq("id", user.id)
      .eq("status", "pending")
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (approved) profile = approved as Profile;
  }
  return profile;
}

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const profile = await ensureProfile(data.user);
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const email = data.user.email ?? profile.email;
  return {
    id: data.user.id,
    email,
    name: profile.name || metaString(meta, "name", "full_name") || email.split("@")[0],
    role: profile.role,
    status: profile.status,
    avatarUrl: profile.avatar_url,
  };
});

/**
 * Garante sessão válida e conta aprovada em páginas, server actions e rotas do painel.
 * Conta aguardando aprovação vai para /aguardando-aprovacao; bloqueada volta ao login.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.status === "pending") redirect("/aguardando-aprovacao");
  if (user.status === "blocked") redirect("/login?erro=bloqueado");
  return user;
}

/** Só administradores (gestão da equipe). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
