import "server-only";
import { env } from "@/lib/env";
import { pick } from "@/lib/settings-store";
import { loadSettings, writeInternal } from "@/lib/settings";

/**
 * Login da OutBox no Google (OAuth 2.0) para a Business Profile API.
 * O refresh token fica cifrado no banco (app_settings: gbp_refresh_token); o access token vive em memória.
 */

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

export function redirectUri(): string {
  return `${env.appUrl}/api/google/callback`;
}

export function oauthConfigured(): boolean {
  return Boolean(pick("google_oauth_client_id") && pick("google_oauth_client_secret"));
}

export function googleConnection(): { connected: boolean; email: string | null } {
  return { connected: Boolean(pick("gbp_refresh_token")), email: pick("gbp_email") };
}

export function authUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: pick("google_oauth_client_id") ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `${GBP_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: pick("google_oauth_client_id") ?? "",
      client_secret: pick("google_oauth_client_secret") ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

/** Troca o código do login pelo refresh token e guarda. */
export async function finishLogin(code: string): Promise<{ email: string | null }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error(t.error_description ?? t.error ?? "O Google não devolveu a autorização. Tente conectar de novo.");
  // e-mail da conta (vem no id_token; só leitura do payload, a assinatura já foi validada pelo Google no retorno do token)
  let email: string | null = null;
  try {
    const payload = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    email = payload.email ?? null;
  } catch {
    email = null;
  }
  await writeInternal("gbp_refresh_token", t.refresh_token);
  await writeInternal("gbp_email", email, false);
  cache.token = null;
  return { email };
}

export async function disconnect(): Promise<void> {
  const refresh = pick("gbp_refresh_token");
  if (refresh) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => null);
  }
  await writeInternal("gbp_refresh_token", null);
  await writeInternal("gbp_email", null, false);
  cache.token = null;
}

const cache: { token: { value: string; exp: number } | null } = { token: null };

/** Access token válido (renova com o refresh token quando faltar menos de 1 minuto). */
export async function accessToken(): Promise<string> {
  await loadSettings();
  if (cache.token && cache.token.exp - Date.now() > 60_000) return cache.token.value;
  const refresh = pick("gbp_refresh_token");
  if (!refresh) throw new Error("Conecte a conta Google da OutBox em Google Empresas antes de usar este recurso.");
  const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  if (!t.access_token) {
    throw new Error(
      t.error === "invalid_grant"
        ? "A autorização do Google expirou ou foi revogada. Conecte a conta de novo em Google Empresas."
        : (t.error_description ?? "Não foi possível renovar o acesso ao Google."),
    );
  }
  cache.token = { value: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return t.access_token;
}
