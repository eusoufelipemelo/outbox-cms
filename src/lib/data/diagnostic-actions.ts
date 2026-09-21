"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { assertPublicUrl } from "@/lib/delivery/http";
import { runDiagnostic } from "@/lib/diagnostics/run";
import { normalizeUrl } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  url: z
    .string()
    .trim()
    .min(4, "Cole o endereço do site do cliente.")
    .transform((v) => normalizeUrl(v))
    .refine((v) => {
      try {
        return /\.[a-z]{2,}$/i.test(new URL(v).hostname);
      } catch {
        return false;
      }
    }, "Endereço inválido. Exemplo: clinicaexemplo.com.br"),
  business_name: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
});

export async function createDiagnostic(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    url: formData.get("url") ?? "",
    business_name: formData.get("business_name") || undefined,
    city: formData.get("city") || undefined,
  });
  const ai = formData.get("ai") === "on";
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Confira o endereço do site.", fieldErrors };
  }
  try {
    await assertPublicUrl(parsed.data.url);
  } catch {
    return { ok: false, error: "Esse endereço não é um site público.", fieldErrors: { url: "Use o domínio público do cliente." } };
  }

  const { data, error } = await db()
    .from("diagnostics")
    .insert({
      url: parsed.data.url,
      business_name: parsed.data.business_name ?? null,
      city: parsed.data.city ?? null,
      ai,
      created_by: user.id,
      step: "Na fila",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Não foi possível iniciar o diagnóstico. Tente de novo." };

  after(() => runDiagnostic(data.id));
  revalidatePath("/diagnosticos");
  redirect(`/diagnosticos/${data.id}`);
}

export async function rerunDiagnostic(id: string, ai?: boolean): Promise<ActionResult> {
  await requireUser();
  const { error } = await db()
    .from("diagnostics")
    .update({ ...(typeof ai === "boolean" ? { ai } : {}), status: "running", step: "Na fila", error: null, created_at: new Date().toISOString(), finished_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: "Não foi possível refazer o diagnóstico." };
  after(() => runDiagnostic(id));
  revalidatePath(`/diagnosticos/${id}`);
  return { ok: true, message: "Diagnóstico reiniciado" };
}

export async function deleteDiagnostic(id: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("diagnostics").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível excluir o diagnóstico." };
  revalidatePath("/diagnosticos");
  return { ok: true, message: "Diagnóstico excluído" };
}
