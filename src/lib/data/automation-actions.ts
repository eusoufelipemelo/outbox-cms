"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { CONTENT_TYPES } from "@/lib/ai/labels";
import { IMAGE_MODELS } from "@/lib/ai/image";
import { nextRunAt } from "@/lib/automation/schedule";
import { loadAutomation, runAutomation } from "@/lib/automation/run";
import { approveRun } from "@/lib/automation/approval";
import { env } from "@/lib/env";
import { getMe, setWebhook } from "@/lib/automation/telegram";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  clientId: z.string().uuid("Cliente inválido."),
  active: z.boolean(),
  perMonth: z.coerce.number().int().min(1, "Mínimo de 1 artigo por mês.").max(30, "Máximo de 30 artigos por mês."),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia da semana."),
  hour: z.coerce.number().int().min(0).max(23),
  words: z.coerce.number().int().min(400).max(2500),
  contentType: z.enum(CONTENT_TYPES).nullable(),
  cover: z.boolean(),
  coverModel: z.string().refine((v) => (IMAGE_MODELS as readonly string[]).includes(v), "Modelo de imagem inválido."),
  siteIds: z.array(z.string().uuid()),
  approval: z.enum(["telegram", "auto", "manual"]),
  authorName: z.string().trim().max(120).nullable(),
  gbpPost: z.boolean().optional(),
});

export type AutomationInput = z.input<typeof schema>;

/** Cria ou atualiza a automação de um cliente. */
export async function saveAutomation(input: AutomationInput): Promise<ActionResult<{ nextRunAt: string | null }>> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const v = parsed.data;

  const next = v.active ? nextRunAt({ weekdays: v.weekdays, hour: v.hour, perMonth: v.perMonth }, new Date()) : null;
  const row = {
    client_id: v.clientId,
    active: v.active,
    per_month: v.perMonth,
    weekdays: v.weekdays,
    hour: v.hour,
    words: v.words,
    content_type: v.contentType,
    cover: v.cover,
    cover_model: v.coverModel,
    site_ids: v.siteIds,
    approval: v.approval,
    author_name: v.authorName || null,
    gbp_post: Boolean(v.gbpPost),
    next_run_at: next ? next.toISOString() : null,
    created_by: user.id,
  };
  const { error } = await db().from("automations").upsert(row, { onConflict: "client_id" });
  if (error) return { ok: false, error: `Não foi possível salvar a automação: ${error.message}` };
  revalidatePath("/automacao");
  return { ok: true, data: { nextRunAt: next ? next.toISOString() : null }, message: "Automação salva" };
}

export async function toggleAutomation(clientId: string, active: boolean): Promise<ActionResult> {
  await requireUser();
  const { data } = await db().from("automations").select("weekdays, hour, per_month").eq("client_id", clientId).maybeSingle();
  if (!data) return { ok: false, error: "Configure a automação deste cliente antes de ativar." };
  const d = data as { weekdays: number[]; hour: number; per_month: number };
  const next = active ? nextRunAt({ weekdays: d.weekdays, hour: d.hour, perMonth: d.per_month }) : null;
  const { error } = await db()
    .from("automations")
    .update({ active, next_run_at: next ? next.toISOString() : null })
    .eq("client_id", clientId);
  if (error) return { ok: false, error: "Não foi possível mudar o estado da automação." };
  revalidatePath("/automacao");
  return { ok: true, message: active ? "Automação ligada" : "Automação pausada" };
}

/** Roda agora, sem mexer na próxima data agendada. */
export async function runNow(automationId: string): Promise<ActionResult> {
  await requireUser();
  const automation = await loadAutomation(automationId);
  if (!automation) return { ok: false, error: "Automação não encontrada." };
  after(() => runAutomation(automation));
  revalidatePath("/automacao");
  return { ok: true, message: "Escrevendo o artigo. Leva alguns minutos." };
}

/** Publica o rascunho de uma execução direto do CMS (sem esperar o cliente). */
export async function approveFromCms(runId: string): Promise<ActionResult> {
  await requireUser();
  const result = await approveRun(runId);
  revalidatePath("/automacao");
  return result.ok ? { ok: true, message: "Artigo publicado" } : { ok: false, error: result.message };
}

export async function unlinkTelegram(clientId: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("automations").update({ telegram_chat_id: null }).eq("client_id", clientId);
  if (error) return { ok: false, error: "Não foi possível desconectar o Telegram." };
  revalidatePath("/automacao");
  return { ok: true, message: "Telegram desconectado" };
}

/** Liga o bot do Telegram a este CMS (registra o webhook na API do Telegram). */
export async function connectTelegramBot(): Promise<ActionResult<{ bot: string }>> {
  await requireUser();
  if (!env.telegramBotToken) return { ok: false, error: "Falta TELEGRAM_BOT_TOKEN nas variáveis do Easypanel." };
  if (!env.telegramWebhookSecret) return { ok: false, error: "Falta TELEGRAM_WEBHOOK_SECRET nas variáveis do Easypanel." };
  try {
    const me = await getMe();
    await setWebhook(`${env.appUrl}/api/telegram/webhook`, env.telegramWebhookSecret);
    revalidatePath("/automacao");
    return { ok: true, data: { bot: me.username }, message: `Bot @${me.username} conectado` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível conectar o bot." };
  }
}
