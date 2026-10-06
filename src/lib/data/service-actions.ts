"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { nextRunAt } from "@/lib/automation/schedule";
import { runIgAutomation } from "@/lib/instagram/independent";
import type { ActionResult } from "@/lib/types";

const refresh = () => {
  revalidatePath("/servicos");
  revalidatePath("/automacao");
  revalidatePath("/instagram");
  revalidatePath("/linkedin");
};

/** Serviços contratados. Blog e Google Empresas são um pacote só (um inclui o outro). */
export async function setServices(clientId: string, input: { blogGbp: boolean; instagram: boolean; linkedin?: boolean; formats: string[] }): Promise<ActionResult> {
  await requireUser();
  const formats = input.formats.filter((f) => f === "carousel" || f === "story");
  if (input.instagram && !formats.length) return { ok: false, error: "Escolha pelo menos um formato do Instagram: carrossel ou story." };
  if (input.linkedin && !input.blogGbp) return { ok: false, error: "Os posts da LinkedIn saem dos artigos: ligue também Blog + Google Empresas." };
  const { error } = await db()
    .from("clients")
    .update({ svc_blog_gbp: input.blogGbp, svc_instagram: input.instagram, svc_linkedin: Boolean(input.linkedin), ig_formats: formats.length ? formats : ["carousel", "story"] })
    .eq("id", clientId);
  if (error) return { ok: false, error: "Não foi possível salvar os serviços." };
  // sem Instagram, o calendário próprio dele para
  if (!input.instagram) await db().from("ig_automations").update({ active: false, next_run_at: null }).eq("client_id", clientId);
  refresh();
  return { ok: true, message: "Serviços salvos" };
}

const igSchema = z.object({
  active: z.boolean(),
  perMonth: z.coerce.number().int().min(1, "Mínimo de 1 post por mês.").max(60, "Máximo de 60 posts por mês."),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia da semana."),
  hour: z.coerce.number().int().min(0).max(23),
  approval: z.enum(["telegram", "auto", "manual"]),
  focus: z.string().trim().max(300).nullable(),
});

/** Calendário do Instagram para clientes só de Instagram. */
export async function saveIgAutomation(clientId: string, input: z.input<typeof igSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = igSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const v = parsed.data;
  const next = v.active ? nextRunAt({ weekdays: v.weekdays, hour: v.hour, perMonth: v.perMonth }) : null;
  const { error } = await db()
    .from("ig_automations")
    .upsert(
      {
        client_id: clientId,
        active: v.active,
        per_month: v.perMonth,
        weekdays: v.weekdays,
        hour: v.hour,
        approval: v.approval,
        focus: v.focus || null,
        next_run_at: next ? next.toISOString() : null,
        created_by: user.id,
      },
      { onConflict: "client_id" },
    );
  if (error) return { ok: false, error: "Não foi possível salvar o calendário do Instagram." };
  refresh();
  return { ok: true, message: v.active ? "Calendário do Instagram ligado" : "Calendário do Instagram salvo" };
}

export async function runIgNow(clientId: string): Promise<ActionResult> {
  await requireUser();
  const { data } = await db().from("ig_automations").select("id, client_id, per_month, weekdays, hour, approval, focus, next_run_at").eq("client_id", clientId).maybeSingle();
  if (!data) return { ok: false, error: "Salve o calendário do Instagram antes de rodar." };
  after(async () => {
    try {
      await runIgAutomation(data as Parameters<typeof runIgAutomation>[0]);
    } catch (err) {
      await db().from("ig_automations").update({ last_error: err instanceof Error ? err.message : "falha" }).eq("client_id", clientId);
    }
  });
  refresh();
  return { ok: true, message: "Criando o post. Leva cerca de 1 minuto." };
}
