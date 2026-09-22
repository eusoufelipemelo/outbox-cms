import "server-only";
import { env } from "@/lib/env";

/** Conversa com a API do Telegram (bot criado no @BotFather). */

export type TgButton = { text: string; callback_data: string };

export function telegramEnabled(): boolean {
  return Boolean(env.telegramBotToken);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = env.telegramBotToken;
  if (!token) throw new Error("Telegram desligado: configure TELEGRAM_BOT_TOKEN nas variáveis do Easypanel.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) throw new Error(json.description ?? `Telegram respondeu ${res.status}`);
  return json.result as T;
}

export function sendMessage(chatId: string, text: string, buttons?: TgButton[][]): Promise<{ message_id: number }> {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function editMessageText(chatId: string, messageId: number, text: string): Promise<unknown> {
  return call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" });
}

export function answerCallback(id: string, text: string): Promise<unknown> {
  return call("answerCallbackQuery", { callback_query_id: id, text });
}

export function setWebhook(url: string, secret: string): Promise<unknown> {
  return call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
}

export function getMe(): Promise<{ username: string; first_name: string }> {
  return call("getMe", {});
}

export function getWebhookInfo(): Promise<{ url: string; last_error_message?: string; pending_update_count?: number }> {
  return call("getWebhookInfo", {});
}

/** Nome do bot: vem do env ou é perguntado ao Telegram uma vez por processo. */
let cachedBot: { token: string; username: string } | null = null;
export async function botUsername(): Promise<string | null> {
  const fromEnv = env.telegramBotUsername;
  if (fromEnv) return fromEnv;
  const token = env.telegramBotToken;
  if (!token) return null;
  if (cachedBot?.token === token) return cachedBot.username;
  try {
    const me = await getMe();
    cachedBot = { token, username: me.username };
    return me.username;
  } catch {
    return null;
  }
}

/** Link que o cliente abre para conectar a conversa dele à automação. */
export function connectLink(code: string, bot: string | null): string | null {
  return bot ? `https://t.me/${bot}?start=${code}` : null;
}
