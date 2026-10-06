import "server-only";
import { env } from "@/lib/env";
import { pick } from "@/lib/settings-store";
import { loadSettings, writeInternal } from "@/lib/settings";

/**
 * Login da OutBox na LinkedIn (OAuth 2.0, Community Management API). Uma conexão vale para todas
 * as páginas de empresa em que a conta é administradora. O token de acesso dura 60 dias; com o
 * acesso aprovado, a LinkedIn também devolve um refresh token de 1 ano, e o CMS renova sozinho.
 */

export const LI_SCOPES = ["r_basicprofile", "w_organization_social", "r_organization_social", "rw_organization_admin"];

export function liRedirectUri(): string {
  return `${env.appUrl}/api/linkedin/callback`;
}

export function liConfigured(): boolean {
  return Boolean(pick("linkedin_client_id") && pick("linkedin_client_secret"));
}

export function liConnection(): { connected: boolean; name: string | null; expiresAt: string | null; renewable: boolean } {
  return {
    connected: Boolean(pick("li_access_token")),
    name: pick("li_member_name"),
    expiresAt: pick("li_refresh_expires_at") ?? pick("li_access_expires_at"),
    renewable: Boolean(pick("li_refresh_token")),
  };
}

export function liAuthUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: pick("linkedin_client_id") ?? "",
    redirect_uri: liRedirectUri(),
    state,
    scope: LI_SCOPES.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: pick("linkedin_client_id") ?? "",
      client_secret: pick("linkedin_client_secret") ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

const inSeconds = (s: number | undefined, fallback: number) => new Date(Date.now() + (s ?? fallback) * 1000).toISOString();

async function saveTokens(t: TokenResponse): Promise<void> {
  await writeInternal("li_access_token", t.access_token!);
  await writeInternal("li_access_expires_at", inSeconds(t.expires_in, 60 * 86_400), false);
  if (t.refresh_token) {
    await writeInternal("li_refresh_token", t.refresh_token);
    await writeInternal("li_refresh_expires_at", inSeconds(t.refresh_token_expires_in, 365 * 86_400), false);
  }
}

/** Troca o código do login pelos tokens e guarda o nome de quem conectou. */
export async function finishLiLogin(code: string): Promise<{ name: string | null }> {
  await loadSettings();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: liRedirectUri() });
  if (!t.access_token) throw new Error(t.error_description ?? t.error ?? "A LinkedIn não devolveu a autorização.");
  // refresh token de um login anterior não vale para o novo
  await writeInternal("li_refresh_token", null);
  await writeInternal("li_refresh_expires_at", null, false);
  await saveTokens(t);

  let name: string | null = null;
  try {
    const me = (await (
      await fetch("https://api.linkedin.com/v2/me", { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) })
    ).json()) as { localizedFirstName?: string; localizedLastName?: string };
    name = [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(" ") || null;
  } catch {
    name = null;
  }
  await writeInternal("li_member_name", name, false);
  return { name };
}

export async function liDisconnect(): Promise<void> {
  const token = pick("li_access_token");
  if (token) {
    await fetch("https://www.linkedin.com/oauth/v2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: pick("linkedin_client_id") ?? "", client_secret: pick("linkedin_client_secret") ?? "", token }),
    }).catch(() => null);
  }
  for (const key of ["li_access_token", "li_refresh_token"]) await writeInternal(key, null);
  for (const key of ["li_access_expires_at", "li_refresh_expires_at", "li_member_name"]) await writeInternal(key, null, false);
}

const daysLeft = (iso: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / 86_400_000 : -1);

/** Renova o token de acesso com o refresh token. Devolve false quando não há como renovar. */
async function renew(): Promise<boolean> {
  const refresh = pick("li_refresh_token");
  if (!refresh || daysLeft(pick("li_refresh_expires_at")) <= 0) return false;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!t.access_token) return false;
  await saveTokens(t);
  return true;
}

/** Token de acesso válido; renova quando falta menos de 1 dia. */
export async function liAccessToken(): Promise<string> {
  await loadSettings();
  const token = pick("li_access_token");
  if (!token) throw new Error("Conecte a conta da LinkedIn em LinkedIn antes de usar este recurso.");
  if (daysLeft(pick("li_access_expires_at")) > 1) return token;
  if (await renew()) return pick("li_access_token")!;
  throw new Error("A autorização da LinkedIn venceu. Conecte a conta de novo em LinkedIn.");
}

/** Renova antes de vencer (roda no agendador). Devolve true se renovou. */
export async function refreshLiToken(): Promise<boolean> {
  await loadSettings();
  if (!pick("li_access_token") || daysLeft(pick("li_access_expires_at")) > 10) return false;
  return renew().catch(() => false);
}
