"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { runAi, toAiError } from "@/lib/ai/server";
import { sendForApproval } from "@/lib/approval/client-approval";
import { recordApproval } from "@/lib/approval/history";
import type { ActionResult } from "@/lib/types";

const refresh = (postId: string) => {
  revalidatePath(`/artigos/${postId}`);
  revalidatePath("/artigos");
  revalidatePath("/");
};

/** Manda (ou reenvia) o artigo para o cliente aprovar na área do cliente. */
export async function sendToClient(postId: string): Promise<ActionResult> {
  await requireUser();
  const r = await sendForApproval(postId, { by: "equipe" });
  refresh(postId);
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

/** Reescreve o texto do artigo com o pedido do cliente (guarda a versão anterior no histórico). */
export async function redoWithClientFeedback(postId: string): Promise<ActionResult> {
  const user = await requireUser();
  const { data } = await db().from("posts").select("title, content_html, seo_title, seo_description, approval_feedback").eq("id", postId).maybeSingle();
  const post = data as { title: string; content_html: string; seo_title: string | null; seo_description: string | null; approval_feedback: string | null } | null;
  if (!post) return { ok: false, error: "Artigo não encontrado." };
  if (!post.approval_feedback) return { ok: false, error: "O cliente ainda não escreveu o que quer mudar." };
  try {
    const out = await runAi("improve", {
      html: post.content_html,
      instruction: `Ajuste o artigo conforme o pedido do cliente, mantendo o que não foi mencionado, a estrutura de títulos, os links e o tom. Pedido do cliente: ${post.approval_feedback}`,
    });
    const html = out.html;
    if (!html || html.length < 200) return { ok: false, error: "A IA devolveu um texto incompleto. Tente de novo." };
    await db().from("post_revisions").insert({
      post_id: postId,
      created_by: user.id,
      title: post.title,
      content_html: post.content_html,
      seo_title: post.seo_title,
      seo_description: post.seo_description,
    });
    await db().from("posts").update({ content_html: html, content_json: null, updated_by: user.id }).eq("id", postId);
    await recordApproval(postId, {}, { by: "equipe", kind: "refeito", text: "Texto refeito com a IA a partir do pedido do cliente." });
    refresh(postId);
    return { ok: true, message: "Artigo refeito. Revise e reenvie para o cliente." };
  } catch (err) {
    return { ok: false, error: toAiError(err, "improve").message };
  }
}

/** Troca o link da área do cliente (o antigo para de funcionar). */
export async function regeneratePortalLink(clientId: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("clients").update({ portal_token: randomBytes(16).toString("hex") }).eq("id", clientId);
  if (error) return { ok: false, error: "Não foi possível gerar um novo link." };
  revalidatePath("/servicos");
  return { ok: true, message: "Novo link gerado. O anterior não funciona mais." };
}
