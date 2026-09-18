import "server-only";
import { db } from "@/lib/supabase/admin";
import { effectiveContent, publicUrl, toPublicPost, type ContentSite } from "@/lib/content";
import type { DeliveryEvent, Post, PostSite, Site, SitePlatform } from "@/lib/types";
import { DeliveryError, hostOf, mapLimit, request, type ChannelOutcome } from "./http";
import { logDelivery } from "./log";
import { siteArticleUrl } from "./urls";
import { sendWebhook } from "./webhook";
import { wordpressPublish, wordpressTest, wordpressUnpublish } from "./wordpress";

// Motor de publicação. Server-only: quem chama já validou a sessão (requireUser) ou o CRON_SECRET.

export { siteArticleUrl };

export type PublishResult = {
  siteId: string;
  siteName: string;
  ok: boolean;
  channel: SitePlatform;
  url: string | null;
  message: string;
};

type SiteRow = Site & { client: { name: string; logo_url: string | null } | null };
type Row = PostSite & { site: SiteRow };

const CONCURRENCY = 4;

function toContentSite(site: SiteRow): ContentSite {
  return {
    id: site.id,
    name: site.name,
    url: site.url,
    blog_path: site.blog_path,
    platform: site.platform,
    status: site.status,
    default_author: site.default_author,
    client_name: site.client?.name ?? null,
    client_logo_url: site.client?.logo_url ?? null,
  };
}

async function loadPost(postId: string): Promise<Post> {
  const { data, error } = await db().from("posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o artigo: ${error.message}`);
  if (!data) throw new Error("Artigo não encontrado.");
  return data as Post;
}

async function loadRows(postId: string): Promise<Row[]> {
  const { data, error } = await db()
    .from("post_sites")
    .select("*, site:sites(*, client:clients(name, logo_url))")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Não foi possível carregar os destinos: ${error.message}`);
  return ((data ?? []) as Row[]).filter((r) => r.site);
}

/** URL do destino canônico (outro site do mesmo artigo), se houver. */
function canonicalFor(post: Post, rows: Row[], siteId: string, batch: Set<string>): string | null {
  const c = rows.find((r) => r.is_canonical && r.site_id !== siteId && (r.status === "published" || batch.has(r.site_id)));
  if (!c) return null;
  return publicUrl(c.site, c.slug || post.slug, c.external_url);
}

function errorOutcome(err: unknown): ChannelOutcome {
  if (err instanceof DeliveryError) return { ok: false, statusCode: err.statusCode, message: err.message };
  console.error("[delivery] erro inesperado:", err);
  return { ok: false, statusCode: null, message: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` };
}

/** Webhook de aviso para sites `api` (Next.js/Astro revalidam na hora). Nunca falha a publicação. */
async function notifyApiWebhook(site: SiteRow, event: DeliveryEvent, payload: unknown): Promise<string> {
  if (!site.webhook_url) return "";
  try {
    const r = await sendWebhook(site, event, payload);
    return r.ok ? " Aviso de webhook enviado." : ` Aviso de webhook falhou: ${r.message}`;
  } catch (err) {
    return ` Aviso de webhook falhou: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function publishOne(post: Post, row: Row, rows: Row[], batch: Set<string>, forcedEvent?: "publish" | "update"): Promise<PublishResult> {
  const site = row.site;
  const started = Date.now();
  const wasLive = row.status === "published";
  const event: DeliveryEvent = forcedEvent ?? (wasLive ? "update" : "publish");
  const eff = effectiveContent(post, row);
  const ownUrl = siteArticleUrl(site, eff.slug);
  let outcome: ChannelOutcome;

  try {
    if (site.status === "paused") {
      outcome = { ok: false, statusCode: null, message: "Site pausado. Reative o site para publicar nele." };
    } else if (site.platform === "wordpress") {
      outcome = await wordpressPublish(site, {
        externalId: row.external_id,
        sendStatus: !wasLive,
        title: eff.title,
        content_html: eff.content_html,
        excerpt: eff.excerpt,
        slug: eff.slug,
        category: post.category,
        tags: post.tags ?? [],
        cover_url: post.cover_image_url,
        cover_alt: post.cover_image_alt,
      });
    } else {
      const now = new Date().toISOString();
      const contentSite = toContentSite(site);
      // Payload já no formato "no ar" para o site poder renderizar direto do webhook.
      const payload = toPublicPost(
        contentSite,
        { ...post, published_at: post.published_at ?? now },
        { ...row, published_at: row.published_at ?? now, updated_at: now },
        canonicalFor(post, rows, site.id, batch),
      );
      if (site.platform === "webhook") {
        outcome = await sendWebhook(site, event, payload);
      } else {
        const note = await notifyApiWebhook(site, event, payload);
        outcome = {
          ok: true,
          statusCode: null,
          message: `${wasLive ? "Atualizado" : "Publicado"} na Content API.${note}`,
        };
      }
    }
  } catch (err) {
    outcome = errorOutcome(err);
  }

  const durationMs = Date.now() - started;
  const now = new Date().toISOString();
  const externalUrl = outcome.ok ? (outcome.externalUrl ?? (site.platform === "wordpress" ? row.external_url : ownUrl)) : row.external_url;

  const update: Partial<PostSite> = outcome.ok
    ? {
        status: "published",
        published_at: row.published_at ?? now,
        last_error: null,
        external_id: outcome.externalId ?? row.external_id,
        external_url: externalUrl,
      }
    : {
        // Falha ao atualizar algo que já estava no ar: a versão anterior continua publicada.
        status: wasLive ? "published" : "failed",
        last_error: outcome.message,
      };
  const { error } = await db().from("post_sites").update(update).eq("id", row.id);
  if (error) console.error("[delivery] falha ao atualizar post_sites:", error.message);

  await logDelivery({
    postSiteId: row.id,
    postId: post.id,
    siteId: site.id,
    channel: site.platform,
    event,
    ok: outcome.ok,
    statusCode: outcome.statusCode,
    message: outcome.message,
    durationMs,
  });

  return {
    siteId: site.id,
    siteName: site.name,
    ok: outcome.ok,
    channel: site.platform,
    url: externalUrl ?? null,
    message: outcome.message,
  };
}

/**
 * Publica (ou atualiza) o artigo nos destinos. Sem `siteIds`, usa todos os destinos do artigo
 * exceto os despublicados. Com `siteIds`, cria os vínculos que faltarem.
 */
export async function publishPost(postId: string, opts: { siteIds?: string[]; event?: "publish" | "update" } = {}): Promise<PublishResult[]> {
  const post = await loadPost(postId);
  const siteIds = opts.siteIds ? [...new Set(opts.siteIds)] : null;

  if (siteIds?.length) {
    const { error } = await db()
      .from("post_sites")
      .upsert(
        siteIds.map((site_id) => ({ post_id: postId, site_id })),
        { onConflict: "post_id,site_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Não foi possível vincular os sites: ${error.message}`);
  }

  const rows = await loadRows(postId);
  const targets = siteIds ? rows.filter((r) => siteIds.includes(r.site_id)) : rows.filter((r) => r.status !== "unpublished");
  if (!targets.length) return [];

  const batch = new Set(targets.map((r) => r.site_id));
  const results = await mapLimit(targets, CONCURRENCY, (row) => publishOne(post, row, rows, batch, opts.event));

  if (results.some((r) => r.ok)) {
    const { error } = await db()
      .from("posts")
      .update({ status: "published", published_at: post.published_at ?? new Date().toISOString(), scheduled_at: null })
      .eq("id", postId);
    if (error) console.error("[delivery] falha ao atualizar o artigo:", error.message);
  }
  return results;
}

async function unpublishOne(post: Post, row: Row): Promise<PublishResult> {
  const site = row.site;
  const started = Date.now();
  let outcome: ChannelOutcome;
  // api e webhook: o CMS é a fonte, então o destino sai da API mesmo se o aviso falhar.
  let markUnpublished = site.platform !== "wordpress";

  try {
    if (site.platform === "wordpress") {
      outcome = await wordpressUnpublish(site, row.external_id);
      markUnpublished = outcome.ok;
    } else {
      const eff = effectiveContent(post, row);
      const payload = { id: post.id, slug: eff.slug, url: publicUrl(site, eff.slug, row.external_url) };
      if (site.platform === "webhook") {
        const r = await sendWebhook(site, "unpublish", payload);
        outcome = r.ok ? { ...r, message: `Removido da Content API e aviso de despublicação entregue (HTTP ${r.statusCode}).` } : r;
      } else {
        const note = await notifyApiWebhook(site, "unpublish", payload);
        outcome = { ok: true, statusCode: null, message: `Removido da Content API.${note}` };
      }
    }
  } catch (err) {
    outcome = errorOutcome(err);
  }

  const update: Partial<PostSite> = markUnpublished
    ? { status: "unpublished", last_error: outcome.ok ? null : outcome.message }
    : { last_error: outcome.message };
  const { error } = await db().from("post_sites").update(update).eq("id", row.id);
  if (error) console.error("[delivery] falha ao atualizar post_sites:", error.message);

  await logDelivery({
    postSiteId: row.id,
    postId: post.id,
    siteId: site.id,
    channel: site.platform,
    event: "unpublish",
    ok: outcome.ok,
    statusCode: outcome.statusCode,
    message: outcome.message,
    durationMs: Date.now() - started,
  });

  return { siteId: site.id, siteName: site.name, ok: outcome.ok, channel: site.platform, url: row.external_url, message: outcome.message };
}

/**
 * Tira o artigo do ar. WordPress volta para rascunho (não apaga), webhook recebe `unpublish`,
 * API para de servir. Sem `siteIds`, afeta todos os destinos no ar.
 */
export async function unpublishPost(postId: string, siteIds?: string[]): Promise<PublishResult[]> {
  const post = await loadPost(postId);
  const rows = await loadRows(postId);
  const targets = siteIds?.length
    ? rows.filter((r) => siteIds.includes(r.site_id))
    : rows.filter((r) => r.status === "published" || (r.status === "failed" && r.external_id));
  if (!targets.length) return [];

  const results = await mapLimit(targets, CONCURRENCY, (row) => unpublishOne(post, row));

  // Se não sobrou nenhum destino no ar, o artigo volta a rascunho.
  const { count } = await db()
    .from("post_sites")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("status", "published");
  if (count === 0 && post.status === "published") {
    const { error } = await db().from("posts").update({ status: "draft" }).eq("id", postId);
    if (error) console.error("[delivery] falha ao atualizar o artigo:", error.message);
  }
  return results;
}

async function testApiSite(site: SiteRow): Promise<ChannelOutcome> {
  const res = await request(site.url, { timeoutMs: 10_000, retries: 0, headers: { accept: "text/html,*/*" } });
  await res.body?.cancel().catch(() => {});
  const reachable = res.status < 400 || res.status === 401 || res.status === 403;
  let outcome: ChannelOutcome = reachable
    ? { ok: true, statusCode: res.status, message: `Site no ar (HTTP ${res.status}). A Content API está pronta para a chave pública deste site.` }
    : { ok: false, statusCode: res.status, message: `${hostOf(site.url)} respondeu HTTP ${res.status}. Confira a URL do site.` };

  if (site.webhook_url) {
    try {
      const hook = await sendWebhook(site, "test", null);
      outcome = hook.ok
        ? { ...outcome, message: `${outcome.message} Webhook de aviso respondeu HTTP ${hook.statusCode}.` }
        : { ok: false, statusCode: hook.statusCode, message: `${outcome.message} Webhook de aviso falhou: ${hook.message}` };
    } catch (err) {
      outcome = { ok: false, statusCode: null, message: `${outcome.message} Webhook de aviso falhou: ${err instanceof Error ? err.message : err}` };
    }
  }
  return outcome;
}

/** Testa a conexão com o site e grava o resultado em `sites.last_check_*` e em `deliveries`. */
export async function testSiteConnection(siteId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await db().from("sites").select("*, client:clients(name, logo_url)").eq("id", siteId).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o site: ${error.message}`);
  if (!data) throw new Error("Site não encontrado.");
  const site = data as SiteRow;

  const started = Date.now();
  let outcome: ChannelOutcome;
  try {
    if (site.platform === "wordpress") outcome = await wordpressTest(site);
    else if (site.platform === "webhook") {
      const r = await sendWebhook(site, "test", null);
      outcome = r.ok ? { ...r, message: `Webhook respondeu HTTP ${r.statusCode}. Pronto para receber artigos.` } : r;
    } else outcome = await testApiSite(site);
  } catch (err) {
    outcome = errorOutcome(err);
  }

  const { error: upErr } = await db()
    .from("sites")
    .update({ last_check_at: new Date().toISOString(), last_check_ok: outcome.ok, last_check_message: outcome.message })
    .eq("id", siteId);
  if (upErr) console.error("[delivery] falha ao gravar teste de conexão:", upErr.message);

  await logDelivery({
    siteId,
    channel: site.platform,
    event: "test",
    ok: outcome.ok,
    statusCode: outcome.statusCode,
    message: outcome.message,
    durationMs: Date.now() - started,
  });

  return { ok: outcome.ok, message: outcome.message };
}
