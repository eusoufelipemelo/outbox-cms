import "server-only";
import { db } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/delivery";
import { publishArticleToGbp } from "@/lib/google/publish";

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
  const gbpNote = await alsoOnGoogle(run.automation_id, run.post_id);
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

/** Se a automação pede, publica o artigo também no Google Empresas. Devolve um aviso só quando falha. */
export async function alsoOnGoogle(automationId: string, postId: string): Promise<string | null> {
  const { data } = await db().from("automations").select("gbp_post").eq("id", automationId).maybeSingle();
  if (!(data as { gbp_post?: boolean } | null)?.gbp_post) return null;
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
  const { data: autos } = await db().from("automations").select("id").eq("telegram_chat_id", chatId);
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
