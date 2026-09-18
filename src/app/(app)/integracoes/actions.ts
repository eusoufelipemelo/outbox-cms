"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { publishPost } from "@/lib/delivery";
import { db } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reenvia o artigo para um site (usado em "Entregas recentes"). */
export async function resendDelivery(postId: string, siteId: string): Promise<ActionResult> {
  await requireUser();
  if (!UUID.test(postId) || !UUID.test(siteId)) return { ok: false, error: "Entrega inválida. Atualize a página e tente de novo." };
  try {
    // publishPost cria o vínculo que faltar e marca o artigo como publicado: só reenvia o que ainda é destino ativo.
    const [{ data: post }, { data: link }] = await Promise.all([
      db().from("posts").select("status").eq("id", postId).maybeSingle(),
      db().from("post_sites").select("status").eq("post_id", postId).eq("site_id", siteId).maybeSingle(),
    ]);
    if (!post) return { ok: false, error: "Este artigo não existe mais." };
    if (post.status === "archived") return { ok: false, error: "Este artigo está arquivado. Restaure o artigo antes de reenviar." };
    if (!link) return { ok: false, error: "Este artigo não está mais vinculado ao site." };
    if (link.status === "unpublished") {
      return { ok: false, error: "O artigo foi despublicado deste site. Publique de novo pelo editor do artigo." };
    }
    // sem `event` forçado: o motor decide entre publish (ainda não estava no ar) e update
    const [result] = await publishPost(postId, { siteIds: [siteId] });
    revalidatePath("/integracoes");
    if (!result) return { ok: false, error: "Este artigo não está vinculado ao site." };
    if (!result.ok) return { ok: false, error: `Falhou de novo em ${result.siteName}: ${result.message}` };
    return { ok: true, message: `Artigo reenviado para ${result.siteName}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível reenviar. Tente de novo." };
  }
}
