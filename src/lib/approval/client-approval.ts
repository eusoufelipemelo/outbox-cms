import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { publishPost } from "@/lib/delivery";
import { approveRun, channelsForClient } from "@/lib/automation/approval";
import { sendMessage, telegramEnabled } from "@/lib/automation/telegram";
import { recordApproval } from "./history";

/** Endereço da área do cliente (ou de um artigo dentro dela). */
export function portalUrl(token: string, postId?: string): string {
  return `${env.appUrl}/portal/${token}${postId ? `/${postId}` : ""}`;
}

export function isPortalToken(token: string): boolean {
  return /^[0-9a-f]{32}$/i.test(token);
}

/** Cliente dono do artigo: o que pediu a aprovação ou o dono do primeiro site de destino. */
export async function clientOfPost(postId: string): Promise<string | null> {
  const { data: post } = await db().from("posts").select("approval_client_id").eq("id", postId).maybeSingle();
  const fixed = (post as { approval_client_id: string | null } | null)?.approval_client_id;
  if (fixed) return fixed;
  const { data } = await db().from("post_sites").select("is_canonical, sites!inner(client_id)").eq("post_id", postId).order("is_canonical", { ascending: false }).limit(1).maybeSingle();
  const site = (data as { sites: { client_id: string } | { client_id: string }[] } | null)?.sites;
  return (Array.isArray(site) ? site[0]?.client_id : site?.client_id) ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Coloca o artigo na área do cliente para aprovação e, se o cliente usa o Telegram,
 * avisa por lá com o link. Serve para a equipe (artigo feito à mão ou refeito) e para a automação.
 */
export async function sendForApproval(
  postId: string,
  opts: { clientId?: string | null; by: "equipe" | "automacao"; notify?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const clientId = opts.clientId ?? (await clientOfPost(postId));
  if (!clientId) return { ok: false, message: "Escolha um site de cliente como destino antes de enviar para aprovação." };
  const { data: post } = await db().from("posts").select("title, status, approval_status").eq("id", postId).maybeSingle();
  if (!post) return { ok: false, message: "Artigo não encontrado." };
  if ((post as { status: string }).status === "published") return { ok: false, message: "Este artigo já está no ar." };
  const { data: links } = await db().from("post_sites").select("site_id").eq("post_id", postId).neq("status", "unpublished");
  if (!links?.length) return { ok: false, message: "Escolha o site de destino antes de enviar para aprovação." };

  const wasChanges = (post as { approval_status: string | null }).approval_status === "changes";
  await recordApproval(
    postId,
    { approval_status: "awaiting", approval_client_id: clientId, approval_requested_at: new Date().toISOString(), approval_decided_at: null },
    { by: opts.by, kind: wasChanges ? "refeito" : "enviado" },
  );
  // execução da automação ligada a este artigo volta a esperar o cliente
  await db().from("automation_runs").update({ status: "awaiting" }).eq("post_id", postId).in("status", ["changes", "manual"]);

  if (opts.notify !== false) {
    const { data: c } = await db().from("clients").select("telegram_chat_id, portal_token").eq("id", clientId).maybeSingle();
    const client = c as { telegram_chat_id: string | null; portal_token: string | null } | null;
    if (client?.telegram_chat_id && client.portal_token && telegramEnabled()) {
      const title = (post as { title: string }).title;
      await sendMessage(
        client.telegram_chat_id,
        [
          `<b>${escapeHtml(title)}</b>`,
          "",
          wasChanges ? "Ajustamos o artigo com o que você pediu." : "Tem artigo novo esperando a sua aprovação.",
          "",
          `Leia e aprove por aqui: ${portalUrl(client.portal_token, postId)}`,
        ].join("\n"),
      ).catch((err) => console.error("[aprovação] aviso no Telegram falhou:", err instanceof Error ? err.message : err));
    }
  }
  return { ok: true, message: wasChanges ? "Artigo reenviado para o cliente aprovar" : "Artigo enviado para o cliente aprovar" };
}

/** O cliente aprovou: o artigo vai para o site dele e para os canais contratados. */
export async function approveByClient(postId: string): Promise<{ ok: boolean; message: string }> {
  const { data: post } = await db().from("posts").select("status, approval_status").eq("id", postId).maybeSingle();
  if (!post) return { ok: false, message: "Este artigo não existe mais." };
  if ((post as { status: string }).status === "published") return { ok: false, message: "Este artigo já está no ar." };

  // artigo da automação: o fluxo de lá já publica e cuida dos canais
  const { data: run } = await db()
    .from("automation_runs")
    .select("id")
    .eq("post_id", postId)
    .in("status", ["awaiting", "changes", "manual"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run) {
    const r = await approveRun((run as { id: string }).id);
    return { ok: r.ok, message: r.ok ? "Aprovado! O artigo está indo para o seu site agora." : r.message };
  }

  const clientId = await clientOfPost(postId);
  const { data: links } = await db().from("post_sites").select("site_id").eq("post_id", postId).neq("status", "unpublished");
  const siteIds = ((links ?? []) as { site_id: string }[]).map((l) => l.site_id);
  if (!siteIds.length) return { ok: false, message: "Este artigo ainda não tem site de destino. A equipe da OutBox já foi avisada." };

  await db().from("posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", postId);
  const results = await publishPost(postId, { siteIds });
  if (results.length && results.every((r) => !r.ok)) {
    await db().from("posts").update({ status: "draft", published_at: null }).eq("id", postId);
    return { ok: false, message: "A publicação falhou. A equipe da OutBox já vai olhar." };
  }
  await recordApproval(postId, { approval_status: "approved", approval_decided_at: new Date().toISOString() }, { by: "cliente", kind: "aprovado" });
  if (clientId) {
    const note = await channelsForClient(clientId, postId);
    if (note) console.warn(`[aprovação] ${postId}: ${note}`);
  }
  return { ok: true, message: "Aprovado! O artigo está indo para o seu site agora." };
}

/** O cliente pediu ajustes: o recado chega ao Painel do CMS e ao artigo. */
export async function changesByClient(postId: string, text: string): Promise<{ ok: boolean; message: string }> {
  const message = text.trim();
  if (message.length < 3) return { ok: false, message: "Escreva o que você quer mudar no artigo." };
  const { data: post } = await db().from("posts").select("status").eq("id", postId).maybeSingle();
  if (!post) return { ok: false, message: "Este artigo não existe mais." };
  if ((post as { status: string }).status === "published") return { ok: false, message: "Este artigo já está no ar. Fale com a equipe da OutBox para mudar." };
  await recordApproval(
    postId,
    { approval_status: "changes", approval_feedback: message.slice(0, 2000), approval_decided_at: new Date().toISOString() },
    { by: "cliente", kind: "ajustes", text: message },
  );
  await db().from("automation_runs").update({ status: "changes", feedback: message.slice(0, 2000) }).eq("post_id", postId).in("status", ["awaiting", "changes", "manual"]);
  return { ok: true, message: "Pedido enviado. A equipe da OutBox vai ajustar e mandar de novo para você aprovar." };
}
