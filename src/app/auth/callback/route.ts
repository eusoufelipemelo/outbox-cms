import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { env } from "@/lib/env";
import type { NoticeCode } from "@/lib/auth-errors";

// Retorno dos links do Supabase: confirmação de e-mail, redefinição de senha e login com Google.
export const dynamic = "force-dynamic";

const OTP_TYPES: EmailOtpType[] = ["signup", "recovery", "invite", "magiclink", "email", "email_change"];
const RESET_PATH = "/redefinir-senha";
// Área do cliente: mesmas contas do Supabase, telas próprias.
const CLIENT_RESET_PATH = "/cliente/nova-senha";

// Atrás do proxy, request.url aponta para o endereço interno (0.0.0.0:3000): usa o endereço público.
function go(_request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, env.appUrl));
}

/** Google manda `full_name`; o resto do CMS lê `user_metadata.name`. */
async function syncName(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (meta.name || !fullName) return;
  await db().auth.admin.updateUserById(user.id, { user_metadata: { name: fullName } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const otpType = params.get("type") as EmailOtpType | null;
  const rawNext = params.get("next") ?? "";
  const fromClientArea = rawNext.startsWith("/cliente");
  const isRecovery = otpType === "recovery" || rawNext === RESET_PATH || rawNext === CLIENT_RESET_PATH;
  const next = isRecovery ? RESET_PATH : safeNext(rawNext);

  const fail = (code: NoticeCode) =>
    fromClientArea
      ? go(request, isRecovery ? `/cliente/esqueci-senha?erro=${code}` : `/cliente/entrar?erro=${code}`)
      : isRecovery
        ? go(request, `/esqueci-senha?erro=${code}`)
        : go(request, `/login?erro=${code}`);

  // Erro devolvido pelo Supabase/Google (link vencido, consentimento negado...).
  if (params.get("error") || params.get("error_code")) {
    const detail = `${params.get("error_code") ?? ""} ${params.get("error_description") ?? ""}`.toLowerCase();
    if (detail.includes("expired")) return fail("link-expirado");
    // `via=google` vem do redirectTo montado em signInWithGoogle.
    if (params.get("via") === "google") return fail("google-cancelado");
    return fail("link-invalido");
  }

  const supabase = await createSessionClient();
  let user: User | null = null;

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
      // PKCE: o verificador fica num cookie do navegador que pediu o link.
      if (text.includes("code verifier") || text.includes("code_verifier") || text.includes("flow_state_not_found")) {
        return fail(isRecovery ? "recuperacao-outro-navegador" : "confirmado-outro-navegador");
      }
      if (text.includes("expired")) return fail("link-expirado");
      return fail("link-invalido");
    }
    user = data.user;
  } else if (tokenHash && otpType && OTP_TYPES.includes(otpType)) {
    // Modelos de e-mail com {{ .TokenHash }} funcionam em qualquer navegador.
    const { data, error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
    if (error) return fail(`${error.code ?? error.message}`.includes("expired") ? "link-expirado" : "link-invalido");
    user = data.user;
  } else {
    return fail("link-invalido");
  }

  if (!user) return fail("link-invalido");

  try {
    await syncName(user);
    const profile = await ensureProfile(user);
    const isClient = profile.role === "client";
    if (isRecovery) return go(request, isClient ? CLIENT_RESET_PATH : RESET_PATH);
    if (profile.status === "blocked") {
      await supabase.auth.signOut();
      return isClient ? go(request, "/cliente/entrar?erro=bloqueado") : fail("bloqueado");
    }
    // a própria /cliente libera convidados e mostra "aguardando" para os demais
    if (isClient) return go(request, "/cliente");
    if (profile.status === "pending") return go(request, "/aguardando-aprovacao");
  } catch {
    return fail("falha");
  }
  return go(request, next);
}
