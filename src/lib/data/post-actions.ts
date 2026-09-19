"use server";

import { z } from "zod";
import { canPublish, requireUser, type CurrentUser } from "@/lib/auth";

const WRITER_BLOCKED = "Redatores escrevem e salvam; publicar, agendar, arquivar ou excluir é com um editor ou administrador. O artigo está salvo.";
import { db } from "@/lib/supabase/admin";
import { publishPost, unpublishPost, type PublishResult } from "@/lib/delivery";
import { FAQ_MAX, TAKEAWAYS_MAX } from "@/lib/geo";
import { sanitizeArticleHtml, sanitizePlainText } from "@/lib/sanitize";
import { countWords, readingMinutes, slugify } from "@/lib/utils";
import { listPublications, listRevisions } from "@/lib/data/posts";
import type { ActionResult, PostStatus, SitePlatform } from "@/lib/types";
import type {
  Publication,
  PublishOutcome,
  RestoredRevision,
  RevisionItem,
  SaveOutcome,
  SavePostInput,
} from "@/components/editor/types";

// ============ Validação ============

const id = z.guid({ error: "Identificador inválido." });
const text = (max: number) => z.string().max(max, { error: `Use no máximo ${max} caracteres.` });

const required = (max: number, message: string) =>
  z
    .string()
    .trim()
    .min(1, { error: message })
    .max(max, { error: `Use no máximo ${max} caracteres.` });

const faqItemSchema = z.object({
  question: required(300, "Toda pergunta frequente precisa do texto da pergunta."),
  answer: required(1500, "Toda pergunta frequente precisa de uma resposta."),
});
const faqSchema = z.array(faqItemSchema).max(FAQ_MAX, { error: `Use no máximo ${FAQ_MAX} perguntas frequentes.` });

const sourceSchema = z.object({
  title: required(300, "Dê um título a cada fonte."),
  url: z
    .string()
    .trim()
    .max(2000, { error: "Endereço da fonte longo demais." })
    .pipe(z.httpUrl({ error: "Endereço de fonte inválido. Use um link completo, com https://." })),
  publisher: text(160),
});

const destinationSchema = z.object({
  siteId: id,
  isCanonical: z.boolean(),
  overrideTitle: text(300),
  overrideExcerpt: text(1000),
  overrideContentHtml: text(3_000_000),
  overrideSeoTitle: text(300),
  overrideSeoDescription: text(500),
  overrideAnswerSummary: text(1000),
  overrideFaq: faqSchema,
});

const saveSchema = z.object({
  id: id.nullish(),
  title: text(300),
  slug: text(160),
  excerpt: text(1000),
  contentHtml: text(5_000_000),
  contentJson: z.unknown().optional(),
  coverImageUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Endereço de imagem inválido." })]),
  coverImageAlt: text(300),
  category: text(80),
  tags: z.array(text(60)).max(30, { error: "Use no máximo 30 tags." }),
  authorName: text(120),
  seoTitle: text(300),
  seoDescription: text(500),
  focusKeyword: text(120),
  answerSummary: text(1000),
  keyTakeaways: z
    .array(required(300, "Remova os pontos principais vazios."))
    .max(TAKEAWAYS_MAX, { error: `Use no máximo ${TAKEAWAYS_MAX} pontos principais.` }),
  faq: faqSchema,
  sources: z.array(sourceSchema).max(30, { error: "Use no máximo 30 fontes." }),
  contentType: z.enum(["article", "howto", "guide", "list", "comparison", "news"], { error: "Tipo de conteúdo inválido." }),
  scheduledAt: z.iso.datetime({ offset: true, error: "Data de agendamento inválida." }).nullable(),
  sites: z.array(destinationSchema).max(200),
});

type SaveData = z.infer<typeof saveSchema>;

class UserError extends Error {}

function parseId(value: string): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new UserError("Artigo não encontrado. Recarregue a página.");
  return parsed.data;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message || "Dados inválidos. Recarregue a página e tente de novo.";
}

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof UserError) return { ok: false, error: error.message };
  // redirect() de requireUser precisa propagar
  if (error && typeof error === "object" && "digest" in error) throw error;
  console.error("[artigos]", error);
  const message = error instanceof Error ? error.message : "";
  return { ok: false, error: message ? `Algo deu errado: ${message}` : "Algo deu errado. Tente de novo." };
}

const nullIfEmpty = (value: string | null | undefined) => {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
};

/** FAQ em texto puro (sem HTML), pronta para o jsonb e para o schema FAQPage. */
function cleanFaq(items: { question: string; answer: string }[]) {
  return items
    .map((f) => ({ question: sanitizePlainText(f.question), answer: sanitizePlainText(f.answer) }))
    .filter((f) => f.question && f.answer);
}

// ============ Persistência ============

const sameInstant = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

const REVISION_INTERVAL_MS = 10 * 60 * 1000;

interface Persisted {
  id: string;
  savedAt: string;
  slug: string;
  status: PostStatus;
  publishedAt: string | null;
  siteIds: string[];
  revision: RevisionItem | null;
}

async function writeRevision(
  postId: string,
  user: CurrentUser,
  snapshot: { title: string; content_html: string; seo_title: string | null; seo_description: string | null },
): Promise<RevisionItem | null> {
  const { data } = await db()
    .from("post_revisions")
    .insert({ post_id: postId, created_by: user.id, ...snapshot })
    .select("id,title,created_at")
    .single();
  if (!data) return null;
  return { id: data.id, createdAt: data.created_at, title: data.title, authorName: user.name };
}

async function persist(input: SaveData, user: CurrentUser, opts: { forceRevision?: boolean } = {}): Promise<Persisted> {
  const contentHtml = sanitizeArticleHtml(input.contentHtml);
  const words = countWords(contentHtml);
  const title = input.title.trim();
  const slug = slugify(input.slug || title);

  const row = {
    title,
    slug,
    excerpt: nullIfEmpty(input.excerpt),
    content_html: contentHtml,
    content_json: input.contentJson ?? null,
    cover_image_url: nullIfEmpty(input.coverImageUrl),
    cover_image_alt: nullIfEmpty(input.coverImageAlt),
    category: nullIfEmpty(input.category),
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    author_name: nullIfEmpty(input.authorName),
    seo_title: nullIfEmpty(input.seoTitle),
    seo_description: nullIfEmpty(input.seoDescription),
    focus_keyword: nullIfEmpty(input.focusKeyword),
    answer_summary: nullIfEmpty(sanitizePlainText(input.answerSummary)),
    key_takeaways: input.keyTakeaways.map(sanitizePlainText).filter(Boolean),
    faq: cleanFaq(input.faq),
    sources: input.sources.map((s) => ({
      title: sanitizePlainText(s.title),
      url: s.url,
      publisher: nullIfEmpty(sanitizePlainText(s.publisher)),
    })),
    content_type: input.contentType,
    scheduled_at: input.scheduledAt,
    word_count: words,
    reading_minutes: words === 0 ? 0 : readingMinutes(words),
    updated_by: user.id,
  };

  const columns = "id,updated_at,slug,status,published_at,scheduled_at";
  let saved: { id: string; updated_at: string; slug: string; status: PostStatus; published_at: string | null; scheduled_at: string | null };
  if (input.id) {
    // scheduled_at de artigo agendado/publicado só muda por schedulePost/publicação: o autosave não pode
    // reagendar (nem mandar para o passado, o que publicaria na hora) nem desfazer o que o agendador gravou.
    const { scheduled_at: scheduledAt, ...fields } = row;
    const { data, error } = await db().from("posts").update(fields).eq("id", input.id).select(columns).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new UserError("Este artigo não existe mais. Ele pode ter sido excluído por outra pessoa.");
    saved = data;
    if ((saved.status === "draft" || saved.status === "archived") && !sameInstant(saved.scheduled_at, scheduledAt)) {
      const { data: again, error: schedError } = await db()
        .from("posts")
        .update({ scheduled_at: scheduledAt })
        .eq("id", input.id)
        .in("status", ["draft", "archived"])
        .select(columns)
        .maybeSingle();
      if (schedError) throw new Error(schedError.message);
      if (again) saved = again;
    }
  } else {
    const { data, error } = await db()
      .from("posts")
      .insert({ ...row, status: "draft", created_by: user.id })
      .select(columns)
      .single();
    if (error || !data) throw new Error(error?.message ?? "insert sem retorno");
    saved = data;
  }
  const postId = saved.id;

  // ---- destinos ----
  const requested = [...new Map(input.sites.map((s) => [s.siteId, s])).values()];
  let siteIds: string[] = [];
  if (requested.length) {
    const { data: existing } = await db()
      .from("sites")
      .select("id")
      .in(
        "id",
        requested.map((s) => s.siteId),
      );
    const valid = new Set(((existing ?? []) as { id: string }[]).map((s) => s.id));
    const sites = requested.filter((s) => valid.has(s.siteId));
    siteIds = sites.map((s) => s.siteId);
    const canonical = sites.find((s) => s.isCanonical)?.siteId ?? null;
    if (sites.length) {
      // status fica de fora: novas linhas nascem 'pending', as existentes mantêm o estado de entrega
      const { error } = await db()
        .from("post_sites")
        .upsert(
          sites.map((s) => ({
            post_id: postId,
            site_id: s.siteId,
            is_canonical: s.siteId === canonical,
            override_title: nullIfEmpty(s.overrideTitle),
            override_excerpt: nullIfEmpty(s.overrideExcerpt),
            override_content_html: nullIfEmpty(sanitizeArticleHtml(s.overrideContentHtml)),
            override_seo_title: nullIfEmpty(s.overrideSeoTitle),
            override_seo_description: nullIfEmpty(s.overrideSeoDescription),
            override_answer_summary: nullIfEmpty(sanitizePlainText(s.overrideAnswerSummary)),
            override_faq: s.overrideFaq.length ? cleanFaq(s.overrideFaq) : null,
          })),
          { onConflict: "post_id,site_id" },
        );
      if (error) throw new Error(error.message);
      // site escolhido de novo depois de despublicado volta a aguardar publicação
      await db()
        .from("post_sites")
        .update({ status: "pending" })
        .eq("post_id", postId)
        .eq("status", "unpublished")
        .in("site_id", siteIds);
    }
  }
  // Remove destinos desmarcados que nunca foram ao ar (pendentes ou com falha). Publicados só saem via
  // despublicar; despublicados ficam no histórico até alguém remover o destino (removeDestination).
  let removal = db().from("post_sites").delete().eq("post_id", postId).in("status", ["pending", "failed"]);
  if (siteIds.length) removal = removal.not("site_id", "in", `(${siteIds.join(",")})`);
  const { error: removeError } = await removal;
  if (removeError) throw new Error(removeError.message);

  // ---- histórico: no máximo a cada 10 minutos (ou quando pedido) ----
  let revision: RevisionItem | null = null;
  if (title || contentHtml) {
    let due = Boolean(opts.forceRevision);
    if (!due) {
      const { data: last } = await db()
        .from("post_revisions")
        .select("created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      due = !last || Date.now() - new Date(last.created_at).getTime() >= REVISION_INTERVAL_MS;
    }
    if (due) {
      revision = await writeRevision(postId, user, {
        title,
        content_html: contentHtml,
        seo_title: row.seo_title,
        seo_description: row.seo_description,
      });
    }
  }

  return {
    id: postId,
    savedAt: saved.updated_at,
    slug: saved.slug,
    status: saved.status,
    publishedAt: saved.published_at,
    siteIds,
    revision,
  };
}

function parseInput(input: SavePostInput): SaveData {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new UserError(firstIssue(parsed.error));
  return parsed.data;
}

function outcome(p: Persisted, publications: Publication[]): SaveOutcome {
  return { id: p.id, savedAt: p.savedAt, slug: p.slug, status: p.status, publications, revision: p.revision };
}

// ============ Actions ============

/** Salva o artigo (cria na primeira vez). Usado pelo autosave e pelo Cmd/Ctrl+S. */
export async function savePost(input: SavePostInput): Promise<ActionResult<SaveOutcome>> {
  try {
    const user = await requireUser();
    const data = parseInput(input);
    const saved = await persist(data, user);
    return { ok: true, data: outcome(saved, await listPublications(saved.id)) };
  } catch (error) {
    return fail(error);
  }
}

/** Salva e publica agora nos destinos escolhidos. */
export async function publishArticle(input: SavePostInput, onlySiteIds?: string[]): Promise<ActionResult<PublishOutcome>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const data = parseInput(input);
    if (!data.title.trim()) throw new UserError("Dê um título ao artigo antes de publicar.");
    if (!data.sites.length) throw new UserError("Escolha ao menos um site em Destinos para publicar.");

    const saved = await persist(data, user, { forceRevision: true });
    let siteIds = saved.siteIds;
    if (onlySiteIds?.length) siteIds = siteIds.filter((s) => onlySiteIds.includes(s));
    if (!siteIds.length) throw new UserError("Nenhum dos sites escolhidos existe mais. Revise os destinos.");

    const before = await listPublications(saved.id);
    const allLive = siteIds.every((s) => before.find((p) => p.siteId === s)?.status === "published");
    const event: "publish" | "update" = allLive ? "update" : "publish";

    let results: PublishResult[];
    try {
      results = await publishPost(saved.id, { siteIds, event: allLive ? "update" : undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      const { data: sites } = await db().from("sites").select("id,name,platform").in("id", siteIds);
      const byId = new Map(((sites ?? []) as { id: string; name: string; platform: SitePlatform }[]).map((s) => [s.id, s]));
      results = siteIds.map((siteId) => ({
        siteId,
        siteName: byId.get(siteId)?.name ?? "Site",
        ok: false,
        channel: byId.get(siteId)?.platform ?? "api",
        url: null,
        message: `A entrega não foi feita: ${message}. Tente de novo em instantes.`,
      }));
    }

    // publishPost já marcou o artigo como publicado (e alinhou snapshot_at); aqui só lê o estado final.
    let status = saved.status;
    let publishedAt = saved.publishedAt;
    const { data: after } = await db().from("posts").select("status,published_at,updated_at").eq("id", saved.id).maybeSingle();
    if (after) {
      status = after.status as PostStatus;
      publishedAt = after.published_at;
      saved.savedAt = after.updated_at;
    }

    const publications = await listPublications(saved.id);
    return { ok: true, data: { ...outcome(saved, publications), status, publishedAt, results, event } };
  } catch (error) {
    return fail(error);
  }
}

/** Salva e agenda: o agendador publica na data. */
export async function schedulePost(input: SavePostInput): Promise<ActionResult<SaveOutcome>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const data = parseInput(input);
    if (!data.title.trim()) throw new UserError("Dê um título ao artigo antes de agendar.");
    if (!data.sites.length) throw new UserError("Escolha ao menos um site em Destinos para agendar.");
    if (!data.scheduledAt) throw new UserError("Escolha a data e o horário da publicação.");
    if (new Date(data.scheduledAt).getTime() < Date.now() + 60_000)
      throw new UserError("Escolha um horário no futuro para agendar.");

    const saved = await persist(data, user);
    if (saved.status === "published") throw new UserError("Este artigo já está publicado. Use Atualizar para enviar as mudanças.");
    const { data: updated, error } = await db()
      .from("posts")
      .update({ status: "scheduled", scheduled_at: data.scheduledAt })
      .eq("id", saved.id)
      .select("updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: { ...outcome(saved, await listPublications(saved.id)), status: "scheduled", savedAt: updated.updated_at },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelSchedule(postId: string): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const { data, error } = await db()
      .from("posts")
      .update({ status: "draft" })
      .eq("id", pid)
      .eq("status", "scheduled")
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new UserError("Este artigo não está mais agendado.");
    return { ok: true, data: { savedAt: data.updated_at } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Remove o destino do artigo de vez (some o selo e o histórico de publicação daquele site; o log de
 * entregas fica). Se estiver no ar, tira do ar antes.
 */
export async function removeDestination(
  postId: string,
  siteId: string,
): Promise<ActionResult<{ publications: Publication[] }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const sid = parseId(siteId);
    const { data: link } = await db().from("post_sites").select("status").eq("post_id", pid).eq("site_id", sid).maybeSingle();
    if (link?.status === "published") {
      let results: PublishResult[];
      try {
        results = await unpublishPost(pid, [sid]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "erro desconhecido";
        throw new UserError(`Não foi possível despublicar: ${message}. Tente de novo em instantes.`);
      }
      const failed = results.find((r) => !r.ok);
      if (failed) throw new UserError(`Não foi possível despublicar de ${failed.siteName}: ${failed.message}`);
    }
    const { error } = await db().from("post_sites").delete().eq("post_id", pid).eq("site_id", sid).neq("status", "published");
    if (error) throw new Error(error.message);
    return { ok: true, data: { publications: await listPublications(pid) } };
  } catch (error) {
    return fail(error);
  }
}

/** Tira o artigo do ar em um site. O destino fica como despublicado (selo e histórico continuam). */
export async function unpublishFromSite(
  postId: string,
  siteId: string,
): Promise<ActionResult<{ publications: Publication[] }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const sid = parseId(siteId);
    let results: PublishResult[];
    try {
      results = await unpublishPost(pid, [sid]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      throw new UserError(`Não foi possível despublicar: ${message}. Tente de novo em instantes.`);
    }
    const failed = results.find((r) => !r.ok);
    if (failed) throw new UserError(`Não foi possível despublicar de ${failed.siteName}: ${failed.message}`);
    return { ok: true, data: { publications: await listPublications(pid) } };
  } catch (error) {
    return fail(error);
  }
}

async function takeDown(postId: string): Promise<string | null> {
  const live = (await listPublications(postId)).filter((p) => p.status === "published").map((p) => p.siteId);
  if (!live.length) return null;
  try {
    const results = await unpublishPost(postId, live);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) return `Não foi possível tirar do ar em ${failed.map((f) => f.siteName).join(", ")}.`;
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return `Não foi possível tirar o artigo do ar nos sites: ${message}.`;
  }
}

/** Arquiva: tira do ar nos sites (se estiver publicado) e esconde da lista principal. */
export async function archivePost(postId: string): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const problem = await takeDown(pid);
    if (problem) throw new UserError(`${problem} O artigo não foi arquivado. Tente de novo.`);
    const { data, error } = await db()
      .from("posts")
      .update({ status: "archived", scheduled_at: null })
      .eq("id", pid)
      .select("updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: { savedAt: data.updated_at } };
  } catch (error) {
    return fail(error);
  }
}

export async function unarchivePost(postId: string): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const { data, error } = await db()
      .from("posts")
      .update({ status: "draft" })
      .eq("id", pid)
      .eq("status", "archived")
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new UserError("Este artigo não está mais arquivado. Recarregue a página.");
    return { ok: true, data: { savedAt: data.updated_at } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Exclui o artigo (publicações, entregas e histórico vão junto, em cascata).
 * Antes tenta tirar do ar; se falhar, só exclui com `force`.
 */
export async function deletePost(
  postId: string,
  opts: { force?: boolean } = {},
): Promise<ActionResult<{ needsForce?: boolean }>> {
  try {
    const user = await requireUser();
    if (!canPublish(user)) return { ok: false, error: WRITER_BLOCKED };
    const pid = parseId(postId);
    const problem = await takeDown(pid);
    if (problem && !opts.force) {
      return {
        ok: false,
        error: `${problem} Se excluir mesmo assim, o artigo pode continuar visível nesses sites.`,
        fieldErrors: { force: "needed" },
      };
    }
    const { error } = await db().from("posts").delete().eq("id", pid);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Restaura uma versão do histórico (o texto atual vira uma nova versão antes). */
export async function restoreRevision(postId: string, revisionId: string): Promise<ActionResult<RestoredRevision>> {
  try {
    const user = await requireUser();
    const pid = parseId(postId);
    const rid = parseId(revisionId);
    const [{ data: rev }, { data: current }] = await Promise.all([
      db()
        .from("post_revisions")
        .select("title,content_html,seo_title,seo_description")
        .eq("id", rid)
        .eq("post_id", pid)
        .maybeSingle(),
      db().from("posts").select("title,content_html,seo_title,seo_description").eq("id", pid).maybeSingle(),
    ]);
    if (!rev) throw new UserError("Essa versão não existe mais.");
    if (!current) throw new UserError("Este artigo não existe mais.");

    await writeRevision(pid, user, current);
    const contentHtml = sanitizeArticleHtml(rev.content_html);
    const words = countWords(contentHtml);
    const { data: updated, error } = await db()
      .from("posts")
      .update({
        title: rev.title ?? "",
        content_html: contentHtml,
        content_json: null,
        seo_title: rev.seo_title,
        seo_description: rev.seo_description,
        word_count: words,
        reading_minutes: words === 0 ? 0 : readingMinutes(words),
        updated_by: user.id,
      })
      .eq("id", pid)
      .select("updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: {
        title: rev.title ?? "",
        contentHtml,
        seoTitle: rev.seo_title ?? "",
        seoDescription: rev.seo_description ?? "",
        savedAt: updated.updated_at,
        revisions: await listRevisions(pid),
      },
    };
  } catch (error) {
    return fail(error);
  }
}
