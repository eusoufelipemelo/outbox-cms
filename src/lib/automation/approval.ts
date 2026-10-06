import "server-only";
import { db } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/delivery";
import { publishArticleToGbp } from "@/lib/google/publish";
import { alsoOnInstagram } from "@/lib/instagram/auto";
import { alsoOnLinkedIn } from "@/lib/linkedin/auto";

/** Aprovação do rascunho pelo cliente (Telegram) ou pela equipe (CMS). */

type RunRow = { id: string; post_id: string | null; status: string; automation_id: string };

export async function loadRun(id: string): Promise<RunRow | null> {
  const { data } = await db().from("automation_runs").select("id, post_id, status, automation_id").eq("id", id).maybeSingle();
  return (data as RunRow | null) ?? null;
}

/** Publica o artigo da execução em todos os destinos escolhidos. */
export async function approveRun(runId: string): Promise<{ ok: boolean; message: string; title?: string }> {
  const run = await loadRun(runId);
  if (!run?.post_id) return { ok: false, message: "Este rascunho não existe mais." };
  if (run.status === "published") return { ok: false, message: "Este artigo já está no ar." };

  const { data: post } = await db().from("posts").select("title, status").eq("id", run.post_id).maybeSingle();
  if (!post) return { ok: false, message: "Este rascunho não existe mais." };

  const { data: links } = await db().from("post_sites").select("site_id").eq("post_id", run.post_id).neq("status", "unpublished");
  const siteIds = ((links ?? []) as { site_id: string }[]).map((l) => l.site_id);
  if (!siteIds.length) return { ok: false, message: "Nenhum site escolhido para este artigo." };

  await db().from("posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", run.post_id);
  const results = await publishPost(run.post_id, { siteIds });
  const failed = results.filter((r) => !r.ok).length;
  if (failed === results.length) {
    await db().from("posts").update({ status: "draft", published_at: null }).eq("id", run.post_id);
    await db().from("automation_runs").update({ status: "failed", error: "A publicação falhou em todos os destinos." }).eq("id", runId);
    return { ok: false, message: "A publicação falhou. A equipe da OutBox já vai olhar." };
  }
  const gbpNote = [await alsoOnGoogle(run.automation_id, run.post_id), await alsoOnInstagram(run.automation_id, run.post_id), await alsoOnLinkedIn(run.automation_id, run.post_id)].filter(Boolean).join(" ") || null;
  await db()
    .from("automation_runs")
    .update({
      status: "published",
      error: [failed ? `${failed} destino(s) falharam.` : null, gbpNote].filter(Boolean).join(" ") || null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  return { ok: true, message: "Artigo publicado", title: (post as { title: string }).title };
}

/**
 * Blog e Google Empresas andam juntos: todo artigo de cliente com esse serviço vira novidade
 * nos perfis do Google ligados a ele. Devolve um aviso só quando algo falha.
 */
export async function alsoOnGoogle(automationId: string, postId: string): Promise<string | null> {
  const { data } = await db().from("automations").select("client_id").eq("id", automationId).maybeSingle();
  const clientId = (data as { client_id: string } | null)?.client_id;
  if (!clientId) return null;
  const { data: client } = await db().from("clients").select("svc_blog_gbp").eq("id", clientId).maybeSingle();
  if (!(client as { svc_blog_gbp?: boolean } | null)?.svc_blog_gbp) return null;
  const { count } = await db().from("gbp_locations").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  if (!count) return null; // perfil ainda não ligado: nada a fazer, sem alarme
  try {
    const r = await publishArticleToGbp(postId);
    return r.sent && !r.failed ? null : `Google Empresas: ${r.message}`;
  } catch (err) {
    return `Google Empresas: ${err instanceof Error ? err.message : "falha ao publicar"}`;
  }
}

/** Cliente pediu ajustes: o artigo fica em rascunho e a equipe recebe o recado. */
export async function requestChanges(runId: string): Promise<{ ok: boolean }> {
  const run = await loadRun(runId);
  if (!run) return { ok: false };
  await db().from("automation_runs").update({ status: "changes" }).eq("id", runId);
  return { ok: true };
}

/** Anexa o texto do cliente à última execução que está esperando ajustes. */
export async function attachFeedback(chatId: string, text: string): Promise<{ ok: boolean; title?: string }> {
  const { data: clients } = await db().from("clients").select("id").eq("telegram_chat_id", chatId);
  const clientIds = ((clients ?? []) as { id: string }[]).map((c) => c.id);
  // post do Instagram esperando ajuste tem prioridade (é o pedido mais recente, quando houver)
  if (clientIds.length) {
    const { data: ig } = await db()
      .from("ig_posts")
      .select("id, slides")
      .in("client_id", clientIds)
      .eq("status", "changes")
      .is("feedback", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ig) {
      await db().from("ig_posts").update({ feedback: text.slice(0, 2000) }).eq("id", (ig as { id: string }).id);
      const first = ((ig as { slides: { title?: string }[] }).slides ?? [])[0];
      return { ok: true, title: first?.title ? `post do Instagram "${first.title}"` : "post do Instagram" };
    }
  }
  const { data: autos } = clientIds.length ? await db().from("automations").select("id").in("client_id", clientIds) : { data: [] };
  const ids = ((autos ?? []) as { id: string }[]).map((a) => a.id);
  if (!ids.length) return { ok: false };
  const { data: run } = await db()
    .from("automation_runs")
    .select("id, post_id")
    .in("automation_id", ids)
    .eq("status", "changes")
    .is("feedback", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { ok: false };
  await db().from("automation_runs").update({ feedback: text.slice(0, 2000) }).eq("id", run.id);
  const { data: post } = run.post_id ? await db().from("posts").select("title").eq("id", run.post_id).maybeSingle() : { data: null };
  return { ok: true, title: (post as { title: string } | null)?.title };
}
