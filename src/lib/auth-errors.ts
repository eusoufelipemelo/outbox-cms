// Mensagens de autenticação em pt-BR: dizem o que houve e o que fazer.

export const GOOGLE_DISABLED = "Login com Google ainda não foi ativado. Use e-mail e senha por enquanto.";
export const BLOCKED = "Esta conta está bloqueada. Fale com um administrador da OutBox para liberar o acesso.";
const GENERIC = "Não foi possível concluir agora. Tente de novo em instantes.";

type AuthLikeError = { code?: string; status?: number; message?: string } | null | undefined;

const BY_CODE: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos. Confira e tente de novo, ou use Esqueci minha senha.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar: abra o link que enviamos para você.",
  user_already_exists: "Já existe uma conta com este e-mail. Entre com sua senha ou use Esqueci minha senha.",
  email_exists: "Já existe uma conta com este e-mail. Entre com sua senha ou use Esqueci minha senha.",
  weak_password: "Senha fraca. Use pelo menos 8 caracteres, misturando letras, números e símbolos.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit: "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
  signup_disabled: "O cadastro de contas novas está desligado. Peça acesso à equipe OutBox.",
  email_provider_disabled: "Entrar com e-mail está desligado no momento. Use Continuar com Google.",
  email_address_invalid: "Este e-mail não é aceito. Confira o endereço e tente de novo.",
  email_address_not_authorized: "Este e-mail não pode receber mensagens do CMS ainda. Fale com a equipe OutBox.",
  user_banned: BLOCKED,
  session_not_found: "Sua sessão expirou. Peça um novo link e tente de novo.",
  session_expired: "Sua sessão expirou. Peça um novo link e tente de novo.",
  reauthentication_needed: "Por segurança, entre de novo antes de trocar a senha.",
};

export function authErrorMessage(error: AuthLikeError): string {
  if (!error) return GENERIC;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("provider is not enabled") || message.includes("unsupported provider")) return GOOGLE_DISABLED;
  if (BY_CODE[code]) return BY_CODE[code];
  // Servidores mais antigos do Supabase não mandam `code`.
  if (message.includes("invalid login credentials")) return BY_CODE.invalid_credentials;
  if (message.includes("email not confirmed")) return BY_CODE.email_not_confirmed;
  if (message.includes("already registered")) return BY_CODE.user_already_exists;
  if (message.includes("password should") || message.includes("password is known")) return BY_CODE.weak_password;
  if (error.status === 429 || message.includes("rate limit")) return BY_CODE.over_request_rate_limit;
  return GENERIC;
}

export function isUnconfirmed(error: AuthLikeError): boolean {
  return error?.code === "email_not_confirmed" || (error?.message ?? "").toLowerCase().includes("email not confirmed");
}

/** Avisos vindos de redirecionamento (`?erro=...`) — só códigos conhecidos viram texto. */
export const NOTICES = {
  "link-expirado": "Este link expirou ou já foi usado. Peça um novo e abra o mais recente que chegar.",
  "link-invalido": "Não foi possível validar o link. Peça um novo e tente de novo.",
  "confirmado-outro-navegador":
    "Seu e-mail foi confirmado. Como o link abriu em outro navegador, entre com e-mail e senha aqui.",
  "recuperacao-outro-navegador":
    "Abra o link de redefinição no mesmo navegador em que você pediu, ou peça um novo link aqui.",
  "google-cancelado": "O login com Google foi cancelado. Tente de novo ou use e-mail e senha.",
  "google-desativado": GOOGLE_DISABLED,
  bloqueado: BLOCKED,
  falha: GENERIC,
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function noticeFor(code: unknown): string | null {
  return typeof code === "string" && code in NOTICES ? NOTICES[code as NoticeCode] : null;
}
