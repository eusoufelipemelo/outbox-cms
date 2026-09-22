import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { runAi, generate, aiStatus } from "@/lib/ai/server";
import { sanitizeAiHtml, plainText } from "@/lib/ai/sanitize";
import { generateImage, imagesEnabled, type ImageModel } from "@/lib/ai/image";
import { putImage } from "@/lib/storage";
import { publishPost } from "@/lib/delivery";
import { countWords, readingMinutes, slugify } from "@/lib/utils";
import { dayKey } from "@/components/agenda/dates";
import type { ContentType } from "@/lib/types";
import { nextRunAt } from "./schedule";
import { connectLink, sendMessage, telegramEnabled } from "./telegram";

export type AutomationRow = {
  id: string;
  client_id: string;
  active: boolean;
  per_month: number;
  weekdays: number[];
  hour: number;
  words: number;
  content_type: ContentType | null;
  cover: boolean;
  cover_model: string;
  site_ids: string[];
  approval: "telegram" | "auto" | "manual";
  telegram_chat_id: string | null;
  telegram_link_code: string;
  next_run_at: string | null;
  created_by: string | null;
};

const BATCH = 3;

async function step(runId: string, step: string) {
  await db().from("automation_runs").update({ step }).eq("id", runId);
}

async function finish(runId: string, patch: Record<string, unknown>) {
  await db().from("automation_runs").update({ ...patch, step: null, finished_at: new Date().toISOString() }).eq("id", runId);
}

/** Sites de destino: os escolhidos na automação ou todos os sites ativos do cliente. */
async function destinations(a: AutomationRow): Promise<string[]> {
  const { data } = await db().from("sites").select("id, status").eq("client_id", a.client_id);
  const active = ((data ?? []) as { id: string; status: string }[]).filter((s) => s.status === "active").map((s) => s.id);
  const chosen = a.site_ids.filter((id) => active.includes(id));
  return chosen.length ? chosen : active;
}

/** Descrição de cena para a capa: a IA escreve o prompt da imagem a partir do artigo. */
async function coverPrompt(input: { title: string; summary: string; segment: string | null; city: string | null }): Promise<{ prompt: string; alt: string }> {
  const fallback = {
    prompt: `Fotografia editorial profissional relacionada a "${input.title}"${input.segment ? `, no contexto de ${input.segment}` : ""}${input.city ? `, no Brasil (${input.city})` : ", no Brasil"}. Luz natural, cena real de trabalho, profundidade de campo suave, sem texto e sem logotipos.`,
    alt: input.title,
  };
  if (!env.anthropicApiKey) return fallback;
  try {
    const out = await generate(
      z.object({
        prompt: z.string().describe("Descrição da cena em inglês, 1 a 2 frases, fotográfica e concreta. Sem texto na imagem, sem logotipos, sem pessoas famosas."),
        alt: z.string().describe("Texto alternativo em português do Brasil, até 120 caracteres, descrevendo a cena."),
      }),
      {
        system:
          "Você dirige a fotografia de capa de artigos de blog da agência OutBox. Cria cenas reais, brasileiras quando fizer sentido, sem texto na imagem, sem colagens e sem clichê de banco de imagens genérico.",
        user: `Artigo: "${input.title}"\nResumo: ${input.summary}\nSegmento do cliente: ${input.segment ?? "não informado"}\nCidade: ${input.city ?? "não informada"}\n\nEscreva o prompt da imagem de capa (16:9).`,
      },
      { maxTokens: 1200, timeoutMs: 60_000, effort: "low" },
    );
    return { prompt: `${out.prompt} Editorial photography, natural light, no text, no logos, no watermark.`, alt: out.alt.slice(0, 160) };
  } catch {
    return fallback;
  }
}

async function makeCover(a: AutomationRow, article: { title: string; summary: string }, client: { segment: string | null; city: string | null }) {
  const { prompt, alt } = await coverPrompt({ title: article.title, summary: article.summary, segment: client.segment, city: client.city });
  const { bytes, mime } = await generateImage({ prompt, aspect: "16:9", size: "2K", model: a.cover_model as ImageModel });
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const [year, month] = dayKey(new Date()).split("-");
  const base = slugify(article.title).slice(0, 50) || "capa";
  const { path, url } = await putImage(`${year}/${month}/${crypto.randomUUID()}-${base}.${ext}`, bytes, mime);
  await db().from("media").insert({ path, url, alt, mime, size: bytes.byteLength, client_id: a.client_id, created_by: a.created_by });
  return { url, alt };
}

/** Roda uma automação: escolhe a pauta, escreve o artigo, gera a capa e encaminha para aprovação. */
export async function runAutomation(a: AutomationRow): Promise<{ runId: string; ok: boolean; message: string }> {
  const { data: runRow, error: runErr } = await db()
    .from("automation_runs")
    .insert({ automation_id: a.id, client_id: a.client_id, status: "running", step: "Escolhendo a pauta" })
    .select("id, approval_token")
    .single();
  if (runErr || !runRow) return { runId: "", ok: false, message: "Não foi possível registrar a execução." };
  const runId = runRow.id as string;

  try {
    if (!aiStatus().enabled) throw new Error("Assistente de IA desligado: falta ANTHROPIC_API_KEY.");

    const { data: clientRow } = await db().from("clients").select("name, segment, city, expert_name").eq("id", a.client_id).maybeSingle();
    const client = (clientRow ?? { name: "cliente", segment: null, city: null, expert_name: null }) as {
      name: string;
      segment: string | null;
      city: string | null;
      expert_name: string | null;
    };

    // 1) pauta
    const { ideas } = await runAi("ideas", { clientId: a.client_id, count: 3 });
    const idea = ideas[0];
    await db().from("automation_runs").update({ idea, step: "Escrevendo o artigo" }).eq("id", runId);

    // 2) artigo completo (mesma qualidade da escrita manual: pesquisa + checklist de SEO e GEO)
    const article = await runAi("full_article", {
      topic: idea.title,
      keyword: idea.keyword,
      clientId: a.client_id,
      contentType: a.content_type ?? idea.content_type,
      words: a.words,
    });

    // 3) capa
    let cover: { url: string; alt: string } | null = null;
    if (a.cover && imagesEnabled()) {
      await step(runId, "Gerando a imagem de capa");
      try {
        cover = await makeCover(a, { title: article.title, summary: article.answer_summary }, client);
      } catch (err) {
        console.error(`[automação] capa falhou (${client.name}):`, err instanceof Error ? err.message : err);
      }
    }

    // 4) artigo no CMS, como rascunho
    await step(runId, "Salvando no CMS");
    const html = sanitizeAiHtml(article.content_html);
    const words = countWords(html);
    const { data: post, error: postErr } = await db()
      .from("posts")
      .insert({
        title: article.title,
        slug: slugify(article.slug || article.title),
        excerpt: article.excerpt,
        content_html: html,
        cover_image_url: cover?.url ?? null,
        cover_image_alt: cover?.alt ?? null,
        tags: [article.focus_keyword].filter(Boolean),
        author_name: article.author_name ?? client.expert_name ?? null,
        seo_title: article.seo_title,
        seo_description: article.seo_description,
        focus_keyword: article.focus_keyword,
        answer_summary: article.answer_summary,
        key_takeaways: article.key_takeaways,
        faq: article.faq,
        sources: article.sources ?? [],
        content_type: article.content_type,
        word_count: words,
        reading_minutes: readingMinutes(words),
        status: "draft",
        created_by: a.created_by,
        updated_by: a.created_by,
      })
      .select("id")
      .single();
    if (postErr || !post) throw new Error(`Não foi possível salvar o artigo: ${postErr?.message ?? "sem retorno"}`);
    const postId = post.id as string;

    const siteIds = await destinations(a);
    if (siteIds.length) {
      await db()
        .from("post_sites")
        .upsert(
          siteIds.map((site_id, i) => ({ post_id: postId, site_id, is_canonical: i === 0 })),
          { onConflict: "post_id,site_id" },
        );
    }
    await db().from("automation_runs").update({ post_id: postId }).eq("id", runId);

    // 5) aprovação
    if (a.approval === "auto") {
      if (!siteIds.length) {
        await finish(runId, { status: "manual", error: "Nenhum site ativo neste cliente: o artigo ficou em rascunho." });
        return { runId, ok: true, message: "artigo criado, sem site para publicar" };
      }
      await db().from("posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", postId);
      const results = await publishPost(postId, { siteIds });
      const failed = results.filter((r) => !r.ok).length;
      await finish(runId, { status: failed === results.length ? "failed" : "published", error: failed ? `${failed} destino(s) falharam.` : null });
      return { runId, ok: failed < results.length, message: `publicado em ${results.length - failed}/${results.length} destinos` };
    }

    if (a.approval === "telegram" && a.telegram_chat_id && telegramEnabled()) {
      await step(runId, "Enviando para o cliente no Telegram");
      const link = `${env.appUrl}/previa/${runRow.approval_token}`;
      const text = [
        `<b>${escapeHtml(article.title)}</b>`,
        "",
        escapeHtml(plainText(article.excerpt).slice(0, 300)),
        "",
        `Leia o rascunho completo: ${link}`,
        "",
        "Se estiver bom, toque em Aprovar e publicar. Se quiser mudar algo, toque em Pedir ajustes e escreva aqui mesmo.",
      ].join("\n");
      const msg = await sendMessage(a.telegram_chat_id, text, [
        [
          { text: "✅ Aprovar e publicar", callback_data: `ok:${runId}` },
          { text: "✏️ Pedir ajustes", callback_data: `no:${runId}` },
        ],
      ]);
      await finish(runId, { status: "awaiting", telegram_message_id: msg.message_id });
      return { runId, ok: true, message: "rascunho enviado para o cliente" };
    }

    const reason =
      a.approval === "telegram"
        ? a.telegram_chat_id
          ? "Telegram desligado no servidor: o artigo ficou em rascunho."
          : "O cliente ainda não conectou o Telegram: o artigo ficou em rascunho."
        : null;
    await finish(runId, { status: "manual", error: reason });
    return { runId, ok: true, message: "artigo criado como rascunho" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha inesperada na automação.";
    await finish(runId, { status: "failed", error: message });
    await db().from("automations").update({ last_error: message }).eq("id", a.id);
    return { runId, ok: false, message };
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const COLUMNS =
  "id, client_id, active, per_month, weekdays, hour, words, content_type, cover, cover_model, site_ids, approval, telegram_chat_id, telegram_link_code, next_run_at, created_by";

/**
 * Executa as automações vencidas. Cada uma é "reivindicada" com um update condicional
 * (next_run_at antigo → próxima data), então o agendador interno e o cron externo não repetem.
 */
export async function processAutomations(): Promise<{ automationId: string; ok: boolean; message: string }[]> {
  const now = new Date();
  const { data, error } = await db()
    .from("automations")
    .select(COLUMNS)
    .eq("active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`Não foi possível buscar as automações: ${error.message}`);

  const out: { automationId: string; ok: boolean; message: string }[] = [];
  for (const row of (data ?? []) as AutomationRow[]) {
    const next = nextRunAt({ weekdays: row.weekdays, hour: row.hour, perMonth: row.per_month }, now);
    const { data: claimed } = await db()
      .from("automations")
      .update({ next_run_at: next.toISOString(), last_run_at: now.toISOString(), last_error: null })
      .eq("id", row.id)
      .eq("next_run_at", row.next_run_at)
      .select("id");
    if (!claimed?.length) continue;
    const result = await runAutomation(row);
    out.push({ automationId: row.id, ...result });
  }
  return out;
}

/** Carrega uma automação pelo id (para o "Rodar agora"). */
export async function loadAutomation(id: string): Promise<AutomationRow | null> {
  const { data } = await db().from("automations").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as AutomationRow | null) ?? null;
}

export { connectLink };
