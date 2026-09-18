import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Cliente com service role. Todas as tabelas têm RLS sem políticas públicas,
 * então os dados só são lidos/escritos por aqui — sempre depois de `requireUser()`
 * (painel) ou da validação da chave pública do site (Content API).
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
