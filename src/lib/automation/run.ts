import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { runAi, generate, aiStatus, aiEnabled } from "@/lib/ai/server";
import { sanitizeAiHtml, plainText } from "@/lib/ai/sanitize";
import { generateImage, imagesEnabled, type ImageModel } from "@/lib/ai/image";
import { visualDirection, type VisualClient } from "@/lib/ai/visual";
import { putImage } from "@/lib/storage";
import { publishPost } from "@/lib/delivery";
import { countWords, readingMinutes, slugify } from "@/lib/utils";
import { dayKey } from "@/components/agenda/dates";
import type { ContentType } from "@/lib/types";
import { loadSettings } from "@/lib/settings";
import { nextRunAt } from "./schedule";
import { connectLink, sendMessage, telegramEnabled } from "./telegram";
import { alsoOnGoogle } from "./approval";

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
  author_name: string | null;
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

/** Categoria e etiquetas do artigo, para os campos de Detalhes do CMS. */
async function articleMeta(input: { title: string; summary: string; keyword: string; segment: string | null; existing: string[] }): Promise<{ category: string | null; tags: string[] }> {
  const base = [input.keyword].filter(Boolean);
  if (!aiEnabled()) return { category: null, tags: base };
  try {
    const out = await generate(
      z.object({
        category: z.string().describe("Uma categoria curta do blog, em português, 1 a 3 palavras. Reaproveite uma das existentes quando fizer sentido."),
        tags: z.array(z.string()).describe("3 a 5 etiquetas curtas em português, minúsculas, sem #."),
      }),
      {
        system: "Você organiza o blog de clientes da agência OutBox. Usa categorias e etiquetas simples, que o leitor entende, sem jargão de SEO.",
        user: `Artigo: "${input.title}"
Resumo: ${input.summary}
Palavra-chave: ${input.keyword}
Segmento do cliente: ${input.segment ?? "não informado"}
Categorias já usadas neste blog: ${input.existing.join(", ") || "nenhuma ainda"}

Devolva a categoria e as etiquetas.`,
      },
      { maxTokens: 1000, timeoutMs: 60_000, effort: "low", task: "apoio" },
    );
    const tags = [...new Set([...out.tags, ...base].map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
    return { category: out.category.trim().slice(0, 60) || null, tags };
  } catch {
    return { category: null, tags: base };
  }
}

/** Descrição de cena para a capa: a IA escreve o prompt da imagem a partir do artigo. */
async function coverPrompt(input: { title: string; summary: string; segment: string | null; city: string | null; identity: string }): Promise<{ prompt: string; alt: string }> {
  const fallback = {
    prompt: `Editorial photograph about "${input.title}"${input.segment ? `, in the context of ${input.segment}` : ""}${input.city ? `, in Brazil (${input.city})` : ", in Brazil"}. Real working scene, natural light, shallow depth of field, no text and no logos.${input.identity}`,
    alt: input.title,
  };
  if (!aiEnabled()) return fallback;
  try {
    const out = await generate(
      z.object({
        prompt: z.string().describe("Descrição da cena em inglês, 1 a 2 frases, fotográfica e concreta. Sem texto na imagem, sem logotipos, sem pessoas famosas."),
        alt: z.string().describe("Texto alternativo em português do Brasil, até 120 caracteres, descrevendo a cena."),
      }),
      {
        system:
          "Você dirige a fotografia de capa de artigos de blog da agência OutBox. Cria cenas reais, brasileiras quando fizer sentido, sem texto na imagem, sem colagens e sem clichê de banco de imagens genérico.",
        user: `Artigo: "${input.title}"\nResumo: ${input.summary}\nSegmento do cliente: ${input.segment ?? "não informado"}\nCidade: ${input.city ?? "não informada"}${input.identity ? `\nIdentidade visual da marca (respeite): ${input.identity}` : ""}\n\nEscreva o prompt da imagem de capa (16:9).`,
      },
      { maxTokens: 1200, timeoutMs: 60_000, effort: "low", task: "apoio" },
    );
    return { prompt: `${out.prompt} Editorial photography, no text, no logos, no watermark.${input.identity}`, alt: out.alt.slice(0, 160) };
  } catch {
    return fallback;
  }
}

async function makeCover(a: AutomationRow, article: { title: string; summary: string }, client: { segment: string | null; city: string | null } & VisualClient) {
  const identity = visualDirection(client);
  const { prompt, alt } = await coverPrompt({ title: article.title, summary: article.summary, segment: client.segment, city: client.city, identity });
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
  await loadSettings();
  const { data: runRow, error: runErr } = await db()
    .from("automation_runs")
    .insert({ automation_id: a.id, client_id: a.client_id, status: "running", step: "Escolhendo a pauta" })
    .select("id, approval_token")
    .single();
  if (runErr || !runRow) return { runId: "", ok: false, message: "Não foi possível registrar a execução." };
  const runId = runRow.id as string;

  try {
    if (!aiStatus().enabled) throw new Error("Assistente de IA desligado: falta ANTHROPIC_API_KEY.");

    const { data: clientRow } = await db().from("clients").select("name, segment, city, expert_name, contract_end, brand_color, image_style, image_mood").eq("id", a.client_id).maybeSingle();
    const client = (clientRow ?? { name: "cliente", segment: null, city: null, expert_name: null, contract_end: null }) as {
      name: string;
      segment: string | null;
      city: string | null;
      expert_name: string | null;
      contract_end: string | null;
    } & VisualClient;
    if (client.contract_end && client.contract_end < new Date().toISOString().slice(0, 10)) {
      throw new Error(`Contrato de ${client.name} venceu em ${client.contract_end.split("-").reverse().join("/")}. Renove a data no cadastro do cliente.`);
    }

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

    // 3) categoria e etiquetas (campos de Detalhes)
    await step(runId, "Organizando categoria e etiquetas");
    const { data: usedCats } = await db()
      .from("posts")
      .select("category")
      .not("category", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const existing = [...new Set(((usedCats ?? []) as { category: string }[]).map((c) => c.category))].slice(0, 12);
    const meta = await articleMeta({
      title: article.title,
      summary: article.answer_summary,
      keyword: article.focus_keyword,
      segment: client.segment,
      existing,
    });

    // 4) capa
    let cover: { url: string; alt: string } | null = null;
    if (a.cover && imagesEnabled()) {
      await step(runId, "Gerando a imagem de capa");
      try {
        cover = await makeCover(a, { title: article.title, summary: article.answer_summary }, client);
      } catch (err) {
        console.error(`[automação] capa falhou (${client.name}):`, err instanceof Error ? err.message : err);
      }
    }

    // 5) artigo no CMS, como rascunho
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
        category: meta.category,
        tags: meta.tags,
        author_name: a.author_name?.trim() || client.expert_name?.trim() || article.author_name || null,
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

    // 6) aprovação
    if (a.approval === "auto") {
      if (!siteIds.length) {
        await finish(runId, { status: "manual", error: "Nenhum site ativo neste cliente: o artigo ficou em rascunho." });
        return { runId, ok: true, message: "artigo criado, sem site para publicar" };
      }
      await db().from("posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", postId);
      const results = await publishPost(postId, { siteIds });
      const failed = results.filter((r) => !r.ok).length;
      const gbpNote = failed < results.length ? await alsoOnGoogle(a.id, postId) : null;
      await finish(runId, {
        status: failed === results.length ? "failed" : "published",
        error: [failed ? `${failed} destino(s) falharam.` : null, gbpNote].filter(Boolean).join(" ") || null,
      });
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
  "id, client_id, active, per_month, weekdays, hour, words, content_type, cover, cover_model, site_ids, approval, author_name, telegram_chat_id, telegram_link_code, next_run_at, created_by";

/**
 * Executa as automações vencidas. Cada uma é "reivindicada" com um update condicional
 * (next_run_at antigo → próxima data), então o agendador interno e o cron externo não repetem.
 */
export async function processAutomations(): Promise<{ automationId: string; ok: boolean; message: string }[]> {
  await loadSettings();
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
