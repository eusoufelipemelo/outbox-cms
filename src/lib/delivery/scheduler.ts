import "server-only";
import { db } from "@/lib/supabase/admin";
import { publishPost } from "./index";

export type ScheduledRun = { postId: string; title: string; ok: boolean; sites: number; failed: number; message?: string };

const BATCH = 20;

/**
 * Publica os artigos `scheduled` cujo `scheduled_at` já passou, em todos os seus destinos.
 * Cada artigo é "reivindicado" com um update condicional (status scheduled → published), então
 * o intervalo interno e o cron externo podem rodar ao mesmo tempo sem publicar duas vezes.
 */
export async function processScheduledPosts(): Promise<ScheduledRun[]> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("posts")
    .select("id, title, published_at, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`Não foi possível buscar artigos agendados: ${error.message}`);

  const runs: ScheduledRun[] = [];
  for (const post of (data ?? []) as { id: string; title: string; published_at: string | null; scheduled_at: string | null }[]) {
    const { data: claimed, error: claimErr } = await db()
      .from("posts")
      .update({ status: "published", published_at: post.published_at ?? now, scheduled_at: null })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id");
    if (claimErr || !claimed?.length) continue;

    try {
      const { data: links } = await db().from("post_sites").select("site_id").eq("post_id", post.id);
      const siteIds = (links ?? []).map((l: { site_id: string }) => l.site_id);
      const results = siteIds.length ? await publishPost(post.id, { siteIds }) : [];
      const failed = results.filter((r) => !r.ok).length;

      if (failed === results.length) {
        // Nada foi ao ar (tudo falhou ou nenhum destino): volta a rascunho (mantendo a data) para a equipe
        // ver o problema, sem repetir a cada minuto e sem marcar como publicado um artigo que não está em site nenhum.
        await db().from("posts").update({ status: "draft", scheduled_at: post.scheduled_at, published_at: post.published_at }).eq("id", post.id);
      }
      runs.push({
        postId: post.id,
        title: post.title,
        ok: failed < results.length,
        sites: results.length,
        failed,
        ...(results.length === 0 ? { message: "nenhum destino escolhido; voltou para rascunho" } : {}),
      });
    } catch (err) {
      // Erro inesperado (banco fora, etc.): devolve para a fila e tenta no próximo ciclo.
      await db().from("posts").update({ status: "scheduled", scheduled_at: post.scheduled_at, published_at: post.published_at }).eq("id", post.id);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] falha ao publicar ${post.id}:`, message);
      runs.push({ postId: post.id, title: post.title, ok: false, sites: 0, failed: 0, message });
    }
  }
  return runs;
}

type SchedulerState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const g = globalThis as typeof globalThis & { __outboxScheduler?: SchedulerState };

async function tick() {
  const state = g.__outboxScheduler;
  if (!state || state.running) return;
  state.running = true;
  try {
    const runs = await processScheduledPosts();
    for (const r of runs) {
      console.log(`[scheduler] "${r.title}" → ${r.sites - r.failed}/${r.sites} destinos${r.message ? ` (${r.message})` : ""}`);
    }
  } catch (err) {
    console.error("[scheduler]", err instanceof Error ? err.message : err);
  } finally {
    state.running = false;
  }
}

/** Inicia o agendador interno (a cada 60 s). Idempotente por processo. */
export function startScheduler(intervalMs = 60_000): void {
  if (g.__outboxScheduler) return;
  const state: SchedulerState = { timer: null, running: false };
  g.__outboxScheduler = state;
  state.timer = setInterval(() => void tick(), intervalMs);
  state.timer.unref?.();
  const first = setTimeout(() => void tick(), 15_000);
  first.unref?.();
  console.log(`[scheduler] agendador interno ativo (a cada ${Math.round(intervalMs / 1000)} s)`);
}
