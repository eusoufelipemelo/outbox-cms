import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { answerCallback, editMessageText, sendMessage } from "@/lib/automation/telegram";
import { approveRun, attachFeedback, requestChanges } from "@/lib/automation/approval";

// Webhook do bot do Telegram: conecta a conversa do cliente e recebe aprovação/ajustes.
// Autenticação: cabeçalho x-telegram-bot-api-secret-token = TELEGRAM_WEBHOOK_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Update = {
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number }; from?: { first_name?: string } };
};

function authorized(req: Request): boolean {
  const secret = env.telegramWebhookSecret;
  if (!secret) return false;
  const sent = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function link(chatId: string, code: string): Promise<string> {
  const { data } = await db().from("automations").select("id, client_id").eq("telegram_link_code", code).maybeSingle();
  if (!data) return "Não encontrei esse código. Peça um novo link para a equipe da OutBox.";
  const { data: client } = await db().from("clients").select("name").eq("id", data.client_id).maybeSingle();
  await db().from("automations").update({ telegram_chat_id: chatId }).eq("id", data.id);
  return `Pronto! Esta conversa agora recebe os artigos de <b>${(client as { name: string } | null)?.name ?? "sua empresa"}</b> para aprovação.\n\nA cada novo artigo, você recebe aqui o rascunho com um link para ler. É só tocar em Aprovar e publicar ou em Pedir ajustes.`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "não autorizado" }, { status: 401 });
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) return Response.json({ ok: true });

  try {
    if (update.callback_query) {
      const q = update.callback_query;
      const [action, runId] = (q.data ?? "").split(":");
      const chatId = q.message ? String(q.message.chat.id) : null;
      if (action === "ok" && runId) {
        const result = await approveRun(runId);
        await answerCallback(q.id, result.ok ? "Publicando…" : result.message);
        if (chatId && q.message) {
          await editMessageText(
            chatId,
            q.message.message_id,
            result.ok
              ? `✅ <b>Aprovado.</b> O artigo "${result.title ?? ""}" está indo para o ar agora.`
              : `⚠️ ${result.message}`,
          );
        }
      } else if (action === "no" && runId) {
        await requestChanges(runId);
        await answerCallback(q.id, "Certo!");
        if (chatId) await sendMessage(chatId, "Escreva aqui o que você quer mudar neste artigo. A equipe da OutBox recebe o recado e ajusta.");
      } else {
        await answerCallback(q.id, "Não entendi esse botão.");
      }
      return Response.json({ ok: true });
    }

    const msg = update.message;
    if (msg?.text) {
      const chatId = String(msg.chat.id);
      const start = msg.text.match(/^\/start\s+(\S+)/);
      if (start) {
        await sendMessage(chatId, await link(chatId, start[1]));
      } else if (msg.text.startsWith("/start")) {
        await sendMessage(chatId, "Olá! Abra o link de conexão que a equipe da OutBox enviou para ligar esta conversa à sua empresa.");
      } else if (msg.text.startsWith("/")) {
        await sendMessage(chatId, "Por aqui você só aprova ou pede ajustes nos artigos. Toque nos botões da mensagem do artigo.");
      } else {
        const result = await attachFeedback(chatId, msg.text);
        await sendMessage(
          chatId,
          result.ok
            ? `Recado anotado${result.title ? ` sobre "${result.title}"` : ""}. A equipe da OutBox vai ajustar e mandar de novo.`
            : "Recebi sua mensagem. Para pedir ajustes num artigo, toque em Pedir ajustes na mensagem dele.",
        );
      }
    }
  } catch (err) {
    console.error("[telegram] webhook:", err instanceof Error ? err.message : err);
  }
  return Response.json({ ok: true });
}
