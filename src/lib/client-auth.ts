import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { PROFILE_COLUMNS, ensureProfile } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import type { Profile } from "@/lib/types";

// Área do cliente (/cliente): mesmas contas do Supabase do CMS, com o papel "client".
// Uma conta de cliente só enxerga a empresa (clients.id) que a equipe liberou para ela.

export type ClientCompany = { id: string; name: string; logo_url: string | null; segment: string | null; city: string | null };

export type ClientAccount = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  companyName: string | null;
  avatarUrl: string | null;
};

export type ClientAccess =
  | { state: "anon" }
  | { state: "team"; email: string }
  | { state: "blocked"; email: string }
  | { state: "pending"; account: ClientAccount }
  | { state: "active"; account: ClientAccount; company: ClientCompany; preview?: boolean };

/** Cookie do modo "Ver como o cliente" (só administradores): guarda o clients.id visualizado. */
export const PREVIEW_COOKIE = "ob_cliente_preview";

function toAccount(p: Profile): ClientAccount {
  return { id: p.id, email: p.email, name: p.name?.trim() || p.email.split("@")[0], phone: p.phone, companyName: p.company_name ?? null, avatarUrl: p.avatar_url ?? null };
}

/**
 * Convite: e-mail que a equipe liberou para um cliente. Só vale com o e-mail confirmado,
 * para ninguém se cadastrar com o e-mail de outra pessoa e cair na empresa dela.
 */
async function loadCompany(id: string): Promise<ClientCompany | null> {
  const { data: company } = await db().from("clients").select("id, name, logo_url, segment, city, status").eq("id", id).maybeSingle();
  if (!company || (company as { status: string }).status === "archived") return null;
  const c = company as ClientCompany;
  return { id: c.id, name: c.name, logo_url: c.logo_url, segment: c.segment, city: c.city };
}

async function activateByInvite(profile: Profile, emailConfirmed: boolean): Promise<Profile | null> {
  if (!emailConfirmed || !profile.email) return null;
  const { data: invite } = await db().from("client_invites").select("client_id").eq("email", profile.email.toLowerCase()).maybeSingle();
  const clientId = (invite as { client_id: string } | null)?.client_id;
  if (!clientId) return null;
  const { data } = await db()
    .from("profiles")
    .update({ status: "active", client_id: clientId, approved_at: new Date().toISOString() })
    .eq("id", profile.id)
    .eq("role", "client")
    .eq("status", "pending")
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (data) await db().from("client_invites").delete().eq("email", profile.email.toLowerCase());
  return (data as Profile | null) ?? null;
}

export const getClientAccess = cache(async (): Promise<ClientAccess> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { state: "anon" };
  let profile = await ensureProfile(data.user);
  const email = data.user.email ?? profile.email;
  if (profile.role !== "client") {
    // administrador no modo "Ver como o cliente": enxerga a área sem poder decidir nada
    const previewId = (await cookies()).get(PREVIEW_COOKIE)?.value;
    if (profile.role === "admin" && profile.status === "active" && previewId && /^[0-9a-f-]{36}$/i.test(previewId)) {
      const company = await loadCompany(previewId);
      if (company) return { state: "active", preview: true, company, account: toAccount(profile) };
    }
    return { state: "team", email };
  }
  if (profile.status === "blocked") return { state: "blocked", email };

  if (profile.status === "pending") {
    const activated = await activateByInvite(profile, Boolean(data.user.email_confirmed_at));
    if (!activated) return { state: "pending", account: toAccount(profile) };
    profile = activated;
  }
  if (!profile.client_id) return { state: "pending", account: toAccount(profile) };

  const company = await loadCompany(profile.client_id);
  if (!company) return { state: "pending", account: toAccount(profile) };
  return { state: "active", account: toAccount(profile), company };
});

/** Páginas e ações do painel do cliente: só conta de cliente liberada passa. */
export async function requireClient(): Promise<{ account: ClientAccount; company: ClientCompany; preview: boolean }> {
  const access = await getClientAccess();
  await loadSettings();
  switch (access.state) {
    case "anon":
      redirect("/cliente/entrar");
    case "team":
      redirect("/cliente/entrar?aviso=equipe");
    case "blocked":
      redirect("/cliente/entrar?erro=bloqueado");
    case "pending":
      redirect("/cliente/aguardando");
    case "active":
      return { account: access.account, company: access.company, preview: Boolean(access.preview) };
  }
}

export const PREVIEW_BLOCKED = "Você está vendo como o cliente. Aprovar, pedir ajustes e enviar temas ficam com ele.";
