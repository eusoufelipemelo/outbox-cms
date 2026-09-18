import "server-only";
import { db } from "@/lib/supabase/admin";
import { siteArticleUrl } from "@/lib/delivery/urls";
import type { Post, PostSite, SitePlatform } from "@/lib/types";
import { slugify, stripHtml } from "@/lib/utils";

// Formato público dos artigos: usado pela Content API (/api/v1), pelo embed e pelo payload do webhook.

export type PublicCover = { url: string; alt: string } | null;

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image: PublicCover;
  category: string | null;
  tags: string[];
  author: string | null;
  published_at: string | null;
  updated_at: string;
  reading_minutes: number;
  url: string;
}

export interface PublicPost extends PostSummary {
  content_html: string;
  seo: { title: string; description: string; canonical_url: string; og_image: string | null };
  json_ld: Record<string, unknown>;
}

/** Dados do site necessários para montar URLs e metadados (sem segredos). */
export interface ContentSite {
  id: string;
  name: string;
  url: string;
  blog_path: string;
  platform: SitePlatform;
  status: "active" | "paused";
  default_author: string | null;
  client_name: string | null;
  client_logo_url: string | null;
}

type PostFields = Pick<
  Post,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "cover_image_url"
  | "cover_image_alt"
  | "category"
  | "tags"
  | "author_name"
  | "published_at"
  | "updated_at"
  | "reading_minutes"
> &
  Partial<Pick<Post, "content_html" | "seo_title" | "seo_description" | "focus_keyword" | "word_count" | "status">>;

type PostSiteFields = Pick<PostSite, "slug" | "override_title" | "override_excerpt" | "external_url" | "published_at" | "updated_at"> &
  Partial<Pick<PostSite, "override_content_html" | "override_seo_title" | "override_seo_description">>;

export type EffectiveContent = {
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  seo_title: string;
  seo_description: string;
};

function nonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) if (v != null && v.trim() !== "") return v;
  return null;
}

function autoExcerpt(html: string | undefined, max = 180): string {
  const text = stripHtml(html ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Conteúdo efetivo para um site: overrides de `post_sites` têm prioridade sobre o artigo. */
export function effectiveContent(post: PostFields, ps: PostSiteFields): EffectiveContent {
  const title = nonEmpty(ps.override_title, post.title) ?? "";
  const content_html = nonEmpty(ps.override_content_html, post.content_html) ?? "";
  const excerpt = nonEmpty(ps.override_excerpt, post.excerpt) ?? autoExcerpt(content_html);
  return {
    slug: nonEmpty(ps.slug, post.slug) ?? post.id,
    title,
    excerpt,
    content_html,
    seo_title: nonEmpty(ps.override_seo_title, post.seo_title, title) ?? "",
    seo_description: nonEmpty(ps.override_seo_description, post.seo_description, excerpt) ?? "",
  };
}

/** URL do artigo no site: link real do WordPress quando existir, senão {url}{blog_path}/{slug}. */
export function publicUrl(site: Pick<ContentSite, "url" | "blog_path" | "platform">, slug: string, externalUrl: string | null): string {
  if (site.platform === "wordpress" && externalUrl) return externalUrl;
  return siteArticleUrl(site, slug);
}

function latest(...dates: (string | null | undefined)[]): string {
  const valid = dates.filter((d): d is string => !!d).map((d) => new Date(d).getTime());
  return new Date(valid.length ? Math.max(...valid) : Date.now()).toISOString();
}

export function toSummary(site: ContentSite, post: PostFields, ps: PostSiteFields): PostSummary {
  const eff = effectiveContent(post, ps);
  return {
    id: post.id,
    slug: eff.slug,
    title: eff.title,
    excerpt: eff.excerpt,
    cover_image: post.cover_image_url ? { url: post.cover_image_url, alt: post.cover_image_alt ?? eff.title } : null,
    category: post.category,
    tags: post.tags ?? [],
    author: nonEmpty(post.author_name, site.default_author),
    published_at: ps.published_at ?? post.published_at,
    updated_at: latest(post.updated_at, ps.updated_at),
    reading_minutes: post.reading_minutes || 1,
    url: publicUrl(site, eff.slug, ps.external_url),
  };
}

export function buildJsonLd(site: ContentSite, post: PublicPost | Omit<PublicPost, "json_ld">, wordCount?: number): Record<string, unknown> {
  const publisherName = site.client_name ?? site.name;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo.title.slice(0, 110) || post.title.slice(0, 110),
    description: post.seo.description || undefined,
    image: post.cover_image ? [post.cover_image.url] : undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    author: post.author ? { "@type": "Person", name: post.author } : { "@type": "Organization", name: publisherName, url: site.url },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      url: site.url,
      ...(site.client_logo_url ? { logo: { "@type": "ImageObject", url: site.client_logo_url } } : {}),
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": post.seo.canonical_url },
    url: post.seo.canonical_url,
    articleSection: post.category ?? undefined,
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    wordCount: wordCount || undefined,
    inLanguage: "pt-BR",
  };
  // Remove chaves indefinidas para o JSON ficar limpo.
  return JSON.parse(JSON.stringify(ld)) as Record<string, unknown>;
}

/** Artigo completo no formato público. `canonicalUrl` = URL do site canônico quando for outro destino. */
export function toPublicPost(site: ContentSite, post: PostFields, ps: PostSiteFields, canonicalUrl: string | null): PublicPost {
  const summary = toSummary(site, post, ps);
  const eff = effectiveContent(post, ps);
  const base: Omit<PublicPost, "json_ld"> = {
    ...summary,
    content_html: eff.content_html,
    seo: {
      title: eff.seo_title,
      description: eff.seo_description,
      canonical_url: canonicalUrl ?? summary.url,
      og_image: summary.cover_image?.url ?? null,
    },
  };
  return { ...base, json_ld: buildJsonLd(site, base, post.word_count) };
}

// ---------------------------------------------------------------------------
// Consultas da Content API (sempre filtradas pelo site autenticado pela chave pública)
// ---------------------------------------------------------------------------

const SUMMARY_POST_COLUMNS =
  "id, slug, title, excerpt, cover_image_url, cover_image_alt, category, tags, author_name, published_at, updated_at, reading_minutes, status";
const FULL_POST_COLUMNS = `${SUMMARY_POST_COLUMNS}, content_html, seo_title, seo_description, focus_keyword, word_count`;
const SUMMARY_PS_COLUMNS = "id, site_id, slug, status, is_canonical, override_title, override_excerpt, external_url, published_at, updated_at";
const FULL_PS_COLUMNS = `${SUMMARY_PS_COLUMNS}, override_content_html, override_seo_title, override_seo_description`;

type Row<P> = PostSiteFields & { id: string; post: P };

const KEY_RE = /^pk_[a-z0-9]{8,64}$/i;

export function isValidKeyFormat(key: string): boolean {
  return KEY_RE.test(key);
}

/** Busca o site pela chave pública. Nunca seleciona segredos. */
export async function getSiteByKey(key: string): Promise<ContentSite | null> {
  if (!isValidKeyFormat(key)) return null;
  const { data, error } = await db()
    .from("sites")
    .select("id, name, url, blog_path, platform, status, default_author, client:clients(name, logo_url)")
    .eq("public_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const client = (Array.isArray(data.client) ? data.client[0] : data.client) as { name: string; logo_url: string | null } | null;
  return {
    id: data.id,
    name: data.name,
    url: data.url,
    blog_path: data.blog_path,
    platform: data.platform,
    status: data.status,
    default_author: data.default_author,
    client_name: client?.name ?? null,
    client_logo_url: client?.logo_url ?? null,
  };
}

function visibleQuery(siteId: string, columns: string, opts?: { count?: boolean }) {
  return db()
    .from("post_sites")
    .select(columns, opts?.count ? { count: "exact" } : undefined)
    .eq("site_id", siteId)
    .eq("status", "published")
    .eq("post.status", "published");
}

export type Taxonomy = { name: string; slug: string; count: number };

/** Categorias e tags dos artigos visíveis no site, com contagem. */
export async function listTaxonomies(site: ContentSite): Promise<{ categories: Taxonomy[]; tags: Taxonomy[] }> {
  const { data, error } = await visibleQuery(site.id, "id, post:posts!inner(category, tags, status)").limit(5000);
  if (error) throw new Error(error.message);
  const cats = new Map<string, Taxonomy>();
  const tags = new Map<string, Taxonomy>();
  for (const row of (data ?? []) as unknown as Row<{ category: string | null; tags: string[] | null }>[]) {
    const c = row.post.category?.trim();
    if (c) {
      const slug = slugify(c);
      const t = cats.get(slug) ?? { name: c, slug, count: 0 };
      t.count++;
      cats.set(slug, t);
    }
    for (const raw of row.post.tags ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const slug = slugify(name);
      const t = tags.get(slug) ?? { name, slug, count: 0 };
      t.count++;
      tags.set(slug, t);
    }
  }
  const sort = (a: Taxonomy, b: Taxonomy) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR");
  return { categories: [...cats.values()].sort(sort), tags: [...tags.values()].sort(sort) };
}

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
function safeSearch(q: string): string {
  return q
    .replace(/[,()*%\\:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export type ListParams = { page: number; perPage: number; category?: string | null; tag?: string | null; q?: string | null };

export async function listPublishedPosts(site: ContentSite, params: ListParams): Promise<{ data: PostSummary[]; total: number }> {
  const { page, perPage } = params;
  let categoryNames: string[] | null = null;
  let tagNames: string[] | null = null;

  // category/tag aceitam o nome ou o slug (ex.: "Decoração" ou "decoracao").
  if (params.category || params.tag) {
    const tax = await listTaxonomies(site);
    if (params.category) {
      const wanted = slugify(params.category);
      categoryNames = tax.categories.filter((c) => c.slug === wanted).map((c) => c.name);
      if (!categoryNames.length) return { data: [], total: 0 };
    }
    if (params.tag) {
      const wanted = slugify(params.tag);
      tagNames = tax.tags.filter((t) => t.slug === wanted).map((t) => t.name);
      if (!tagNames.length) return { data: [], total: 0 };
    }
  }

  let query = visibleQuery(site.id, `${SUMMARY_PS_COLUMNS}, post:posts!inner(${SUMMARY_POST_COLUMNS})`, { count: true });
  if (categoryNames) query = query.in("post.category", categoryNames);
  if (tagNames) query = query.overlaps("post.tags", tagNames);
  const q = params.q ? safeSearch(params.q) : "";
  if (q) query = query.or(`title.ilike.*${q}*,excerpt.ilike.*${q}*`, { referencedTable: "post" });

  const from = (page - 1) * perPage;
  const { data, error, count } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);
  if (error) {
    // PostgREST responde 416 quando a página passa do fim.
    if (error.code === "PGRST103") return { data: [], total: count ?? 0 };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as Row<PostFields>[];
  return { data: rows.map((r) => toSummary(site, r.post, r)), total: count ?? rows.length };
}

/** URL do destino canônico quando outro site do mesmo artigo está marcado como canônico e no ar. */
export async function canonicalUrlFor(postId: string, postSlug: string, siteId: string): Promise<string | null> {
  const { data } = await db()
    .from("post_sites")
    .select("site_id, slug, external_url, site:sites(url, blog_path, platform)")
    .eq("post_id", postId)
    .eq("is_canonical", true)
    .eq("status", "published")
    .neq("site_id", siteId)
    .limit(1);
  const row = data?.[0] as
    | { slug: string | null; external_url: string | null; site: { url: string; blog_path: string; platform: SitePlatform } | null }
    | undefined;
  if (!row?.site) return null;
  return publicUrl(row.site, row.slug || postSlug, row.external_url);
}

export async function getPublishedPost(site: ContentSite, slug: string): Promise<PublicPost | null> {
  const clean = slug.trim().toLowerCase().slice(0, 200);
  if (!clean) return null;
  const columns = `${FULL_PS_COLUMNS}, post:posts!inner(${FULL_POST_COLUMNS})`;

  // 1) slug específico do site; 2) slug do artigo quando o site não tem slug próprio.
  let { data, error } = await visibleQuery(site.id, columns).eq("slug", clean).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    ({ data, error } = await visibleQuery(site.id, columns).is("slug", null).eq("post.slug", clean).limit(1));
    if (error) throw new Error(error.message);
  }
  const row = (data?.[0] ?? null) as unknown as Row<PostFields> | null;
  if (!row) return null;
  const canonical = await canonicalUrlFor(row.post.id, row.post.slug, site.id);
  return toPublicPost(site, row.post, row, canonical);
}

/** Resolve só o id do artigo visível pelo slug (usado pelo contador de visualizações). */
export async function findVisiblePostId(site: ContentSite, slug: string): Promise<string | null> {
  const clean = slug.trim().toLowerCase().slice(0, 200);
  if (!clean) return null;
  let { data } = await visibleQuery(site.id, "id, post:posts!inner(id, status)").eq("slug", clean).limit(1);
  if (!data?.length) ({ data } = await visibleQuery(site.id, "id, post:posts!inner(id, slug, status)").is("slug", null).eq("post.slug", clean).limit(1));
  const row = data?.[0] as unknown as { post: { id: string } } | undefined;
  return row?.post.id ?? null;
}

/** Artigos completos mais recentes (feed RSS). */
export async function listRecentFull(site: ContentSite, limit: number): Promise<PublicPost[]> {
  const { data, error } = await visibleQuery(site.id, `${FULL_PS_COLUMNS}, post:posts!inner(${FULL_POST_COLUMNS})`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row<PostFields>[]).map((r) => toPublicPost(site, r.post, r, null));
}

/** Todos os artigos visíveis (sitemap). */
export async function listAllSummaries(site: ContentSite, limit = 5000): Promise<PostSummary[]> {
  const { data, error } = await visibleQuery(site.id, `${SUMMARY_PS_COLUMNS}, post:posts!inner(${SUMMARY_POST_COLUMNS})`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row<PostFields>[]).map((r) => toSummary(site, r.post, r));
}

/** Escapa texto para XML (sitemap, RSS). */
export function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}
