import "server-only";
import { env } from "@/lib/env";
import { pick } from "@/lib/settings-store";
import { db } from "@/lib/supabase/admin";
import { decrypt, encrypt, loadSettings } from "@/lib/settings";

/**
 * Login pelo Instagram (Business Login for Instagram): cada cliente autoriza a conta profissional dele.
 * O token de longa duração vale 60 dias; o CMS renova sozinho antes de vencer.
 */

export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export function igRedirectUri(): string {
  return `${env.appUrl}/api/instagram/callback`;
}

export function igConfigured(): boolean {
  return Boolean(pick("instagram_app_id") && pick("instagram_app_secret"));
}

export function igAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: pick("instagram_app_id") ?? "",
    redirect_uri: igRedirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

type Short = { access_token?: string; user_id?: number | string; error_message?: string; error?: { message?: string } };
type Long = { access_token?: string; expires_in?: number; error?: { message?: string } };

/** Troca o código pelo token longo e guarda a conta do cliente. */
export async function finishIgLogin(clientId: string, code: string): Promise<{ username: string | null }> {
  await loadSettings();
  const form = new URLSearchParams({
    client_id: pick("instagram_app_id") ?? "",
    client_secret: pick("instagram_app_secret") ?? "",
    grant_type: "authorization_code",
    redirect_uri: igRedirectUri(),
    code: code.replace(/#_$/, ""),
  });
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  const short = (await shortRes.json().catch(() => ({}))) as Short;
  if (!short.access_token) throw new Error(short.error_message ?? short.error?.message ?? "O Instagram não devolveu a autorização.");

  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: pick("instagram_app_secret") ?? "", access_token: short.access_token });
  const long = (await (await fetch(`https://graph.instagram.com/access_token?${q}`, { signal: AbortSignal.timeout(20_000) })).json().catch(() => ({}))) as Long;
  const token = long.access_token ?? short.access_token;

  const me = (await (await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`)).json().catch(() => ({}))) as {
    user_id?: string;
    id?: string;
    username?: string;
  };
  const igUserId = String(me.user_id ?? me.id ?? short.user_id ?? "");
  if (!igUserId) throw new Error("Não foi possível identificar a conta do Instagram.");

  const { error } = await db()
    .from("ig_accounts")
    .upsert(
      {
        client_id: clientId,
        ig_user_id: igUserId,
        username: me.username ?? null,
        access_token: encrypt(token),
        token_expires_at: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000).toISOString(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );
  if (error) throw new Error(`Não foi possível salvar a conta: ${error.message}`);
  return { username: me.username ?? null };
}

export type IgAccount = { clientId: string; igUserId: string; username: string | null; token: string };

export async function igAccount(clientId: string): Promise<IgAccount | null> {
  const { data } = await db().from("ig_accounts").select("ig_user_id, username, access_token").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  const token = decrypt((data as { access_token: string }).access_token);
  if (!token) return null;
  return { clientId, igUserId: (data as { ig_user_id: string }).ig_user_id, username: (data as { username: string | null }).username, token };
}

/** Renova os tokens que vencem em menos de 15 dias (roda no agendador, uma vez por dia basta). */
export async function refreshIgTokens(): Promise<number> {
  const limit = new Date(Date.now() + 15 * 86_400_000).toISOString();
  const { data } = await db().from("ig_accounts").select("id, access_token, token_expires_at").lt("token_expires_at", limit);
  let renewed = 0;
  for (const row of (data ?? []) as { id: string; access_token: string }[]) {
    const token = decrypt(row.access_token);
    if (!token) continue;
    const r = (await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)).json().catch(() => ({}))) as Long;
    if (!r.access_token) continue;
    await db()
      .from("ig_accounts")
      .update({ access_token: encrypt(r.access_token), token_expires_at: new Date(Date.now() + (r.expires_in ?? 60 * 86_400) * 1000).toISOString() })
      .eq("id", row.id);
    renewed++;
  }
  return renewed;
}
