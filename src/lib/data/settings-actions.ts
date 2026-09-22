"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { writeSettings } from "@/lib/settings";
import { aiStatus, aiProvider } from "@/lib/ai/server";
import { modelSupport } from "@/lib/ai/openrouter";
import { runAi } from "@/lib/ai/server";
import type { ActionResult } from "@/lib/types";

/** Salva as chaves e modelos do Painel administrativo. */
export async function saveSettings(values: Record<string, string>): Promise<ActionResult> {
  const user = await requireAdmin();
  try {
    await writeSettings(values, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar." };
  }
  revalidatePath("/painel");
  revalidatePath("/automacao");
  return { ok: true, message: "Configurações salvas" };
}

/** Pergunta simples ao modelo de texto, só para conferir chave e modelo. */
export async function testText(): Promise<ActionResult<{ model: string }>> {
  await requireAdmin();
  const status = aiStatus();
  if (!status.enabled) return { ok: false, error: "Nenhuma chave de texto configurada." };
  const model = status.model ?? "";
  let note = "";
  if (aiProvider() === "openrouter") {
    const support = await modelSupport(model);
    if (!support.known) note = ", modelo fora do catálogo do OpenRouter (confira o id)";
    else if (!support.jsonSchema) note = support.jsonObject ? ", em modo JSON simples (este modelo não aceita formato estrito)" : ", modelo sem suporte a resposta em JSON";
  }
  try {
    await runAi("titles", { topic: "teste de conexão do CMS" });
    return { ok: true, data: { model }, message: `${model} respondeu${note}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "O modelo não respondeu." };
  }
}
