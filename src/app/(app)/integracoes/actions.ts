"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { publishPost } from "@/lib/delivery";
import type { ActionResult } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reenvia o artigo para um site (usado em "Entregas recentes"). */
export async function resendDelivery(postId: string, siteId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(postId) || !UUID.test(siteId)) return { ok: false, error: "Entrega inválida. Atualize a página e tente de novo." };
  try {
    const [result] = await publishPost(postId, { siteIds: [siteId], event: "update" });
    revalidatePath("/integracoes");
    if (!result) return { ok: false, error: "Este artigo não está vinculado ao site." };
    if (!result.ok) return { ok: false, error: `Falhou de novo em ${result.siteName}: ${result.message}` };
    return { ok: true, message: `Artigo reenviado para ${result.siteName}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível reenviar. Tente de novo." };
  }
}
