import "server-only";
import { db } from "@/lib/supabase/admin";
import { orderedListSteps } from "@/lib/delivery/markdown";
import { siteArticleUrl } from "@/lib/delivery/urls";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import type { Client, ContentType, FaqItem, Post, PostSite, SitePlatform, SourceItem } from "@/lib/types";
import { joinUrl, slugify, stripHtml } from "@/lib/utils";

// Formato público dos artigos: usado pela Content API (/api/v1), pelo embed e pelo payload do webhook.

export type PublicCover = { url: string; alt: string } | null;

/** Autor com credenciais (E-E-A-T). `author` (string) continua existindo por compatibilidade. */
export type AuthorProfile = { name: string; credentials: string | null; bio: string | null };

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** GEO: resposta direta (40–60 palavras). */
  answer_summary: string | null;
  cover_image: PublicCover;
  category: string | null;
  tags: string[];
  /** Nome do autor (compatível com a v1). */
  author: string | null;
  author_profile: AuthorProfile | null;
  published_at: string | null;
  updated_at: string;
  reading_minutes: number;
  url: string;
}

export interface PublicPost extends PostSummary {
  content_html: string;
  key_takeaways: string[];
  faq: FaqItem[];
  sources: SourceItem[];
  content_type: ContentType;
  seo: { title: string; description: string; canonical_url: string; og_image: string | null };
  /** `{ "@context", "@graph": [...] }` (schema.org). */
  json_ld: Record<string, unknown>;
}

/** Campos do cliente usados como entidade pública (Organization/LocalBusiness, llms.txt, autoria). */
export type ContentClient = Pick<
  Client,
  | "name"
  | "logo_url"
  | "brand_color"
  | "about"
  | "services"
  | "service_area"
  | "address"
  | "city"
  | "state"
  | "phone"
  | "opening_hours"
  | "social_links"
  | "expert_name"
  | "expert_credentials"
  | "expert_bio"
>;

/** Colunas de `clients` para o embed `client:clients(...)`. Nada de dados internos (documento, notas...). */
export const CONTENT_CLIENT_COLUMNS =
  "name, logo_url, brand_color, about, services, service_area, address, city, state, phone, opening_hours, social_links, expert_name, expert_credentials, expert_bio";

/** Dados do site necessários para montar URLs e metadados (sem segredos). */
export interface ContentSite {
  id: string;
  name: string;
  url: string;
  blog_path: string;
  platform: SitePlatform;
  status: "active" | "paused";
  default_author: string | null;
  /** Chave pública do IndexNow (fica em {url}/{chave}.txt). */
  indexnow_key: string | null;
  client: ContentClient | null;
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
  Partial<
    Pick<
      Post,
      | "content_html"
      | "seo_title"
      | "seo_description"
      | "focus_keyword"
      | "word_count"
      | "status"
      | "answer_summary"
      | "key_takeaways"
      | "faq"
      | "sources"
      | "content_type"
    >
  >;

type PostSiteFields = Pick<PostSite, "slug" | "override_title" | "override_excerpt" | "external_url" | "published_at" | "updated_at"> &
  Partial<
    Pick<PostSite, "override_content_html" | "override_seo_title" | "override_seo_description" | "override_answer_summary" | "override_faq">
  >;

export type EffectiveContent = {
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  seo_title: string;
  seo_description: string;
  answer_summary: string | null;
  key_takeaways: string[];
  faq: FaqItem[];
  sources: SourceItem[];
  content_type: ContentType;
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

// ---------------------------------------------------------------------------
// Normalização dos blocos de GEO (valores vindos do banco ou de snapshots antigos)
// ---------------------------------------------------------------------------

const CONTENT_TYPES: readonly ContentType[] = ["article", "howto", "guide", "list", "comparison", "news"];

function cleanText(value: unknown, max = 5000): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

function cleanTextList(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cleanText(v, 1000))
    .filter((v): v is string => !!v)
    .slice(0, maxItems);
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function cleanFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  const out: FaqItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const question = cleanText((item as { question?: unknown }).question, 500);
    const answer = cleanText((item as { answer?: unknown }).answer, 4000);
    if (question && answer) out.push({ question, answer });
  }
  return out.slice(0, 50);
}

function cleanSources(value: unknown): SourceItem[] {
  if (!Array.isArray(value)) return [];
  const out: SourceItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const url = cleanText((item as { url?: unknown }).url, 2000);
    if (!url || !isHttpUrl(url)) continue;
    const title = cleanText((item as { title?: unknown }).title, 300) ?? new URL(url).hostname.replace(/^www\./, "");
    out.push({ title, url, publisher: cleanText((item as { publisher?: unknown }).publisher, 200) });
  }
  return out.slice(0, 50);
}

function cleanContentType(value: unknown): ContentType {
  return CONTENT_TYPES.includes(value as ContentType) ? (value as ContentType) : "article";
}

/** Conteúdo efetivo para um site: overrides de `post_sites` têm prioridade sobre o artigo. */
export function effectiveContent(post: PostFields, ps: PostSiteFields): EffectiveContent {
  const title = nonEmpty(ps.override_title, post.title) ?? "";
  const content_html = nonEmpty(ps.override_content_html, post.content_html) ?? "";
  const excerpt = nonEmpty(ps.override_excerpt, post.excerpt) ?? autoExcerpt(content_html);
  const overrideFaq = cleanFaq(ps.override_faq);
  return {
    slug: nonEmpty(ps.slug, post.slug) ?? post.id,
    title,
    excerpt,
    content_html,
    seo_title: nonEmpty(ps.override_seo_title, post.seo_title, title) ?? "",
    seo_description: nonEmpty(ps.override_seo_description, post.seo_description, excerpt) ?? "",
    answer_summary: cleanText(ps.override_answer_summary, 2000) ?? cleanText(post.answer_summary, 2000),
    key_takeaways: cleanTextList(post.key_takeaways),
    // override_faq vazio (ou null) herda o FAQ do artigo
    faq: overrideFaq.length ? overrideFaq : cleanFaq(post.faq),
    sources: cleanSources(post.sources),
    content_type: cleanContentType(post.content_type),
  };
}

/** URL do artigo no site: link real do WordPress quando existir, senão {url}{blog_path}/{slug}. */
export function publicUrl(site: Pick<ContentSite, "url" | "blog_path" | "platform">, slug: string, externalUrl: string | null): string {
  if (site.platform === "wordpress" && externalUrl) return externalUrl;
  return siteArticleUrl(site, slug);
}

function latest(...dates: (string | null | undefined)[]): string {
  const valid = dates
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter(Number.isFinite);
  return new Date(valid.length ? Math.max(...valid) : Date.now()).toISOString();
}

// ---------------------------------------------------------------------------
// Cliente como entidade e autoria
// ---------------------------------------------------------------------------

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Normaliza o `client:clients(...)` vindo do PostgREST (objeto ou lista). */
export function toContentClient(raw: unknown): ContentClient | null {
  const c = (Array.isArray(raw) ? raw[0] : raw) as Partial<ContentClient> | null | undefined;
  if (!c || typeof c !== "object" || typeof c.name !== "string") return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    name: c.name,
    logo_url: s(c.logo_url),
    brand_color: s(c.brand_color),
    about: s(c.about),
    services: arr(c.services).map((v) => v.trim()).filter(Boolean),
    service_area: s(c.service_area),
    address: s(c.address),
    city: s(c.city),
    state: s(c.state),
    phone: s(c.phone),
    opening_hours: s(c.opening_hours),
    social_links: arr(c.social_links).map((v) => v.trim()).filter(isHttpUrl),
    expert_name: s(c.expert_name),
    expert_credentials: s(c.expert_credentials),
    expert_bio: s(c.expert_bio),
  };
}

/** Nome público da empresa (o nome do site no CMS é interno, como "Site institucional"). */
export function organizationName(site: Pick<ContentSite, "name" | "client">): string {
  return site.client?.name?.trim() || site.name;
}

function siteRoot(site: Pick<ContentSite, "url">): string {
  return site.url.replace(/\/+$/, "");
}

function expertOf(site: Pick<ContentSite, "client">): AuthorProfile | null {
  const c = site.client;
  if (!c?.expert_name) return null;
  return { name: c.expert_name, credentials: c.expert_credentials, bio: c.expert_bio };
}

function sameName(a: string, b: string): boolean {
  const norm = (v: string) => slugify(v);
  return norm(a) === norm(b);
}

/**
 * Autor do artigo: nome do artigo → autor padrão do site → especialista do cliente.
 * As credenciais do especialista só acompanham o autor quando é a mesma pessoa;
 * se o autor for outro, o especialista aparece como revisor no JSON-LD.
 */
export function resolveAuthor(
  site: Pick<ContentSite, "default_author" | "client">,
  postAuthorName: string | null | undefined,
): { author: AuthorProfile | null; reviewer: AuthorProfile | null } {
  const expert = expertOf(site);
  const name = nonEmpty(postAuthorName, site.default_author)?.trim() ?? null;
  if (!name) return { author: expert, reviewer: null };
  if (expert && sameName(name, expert.name)) return { author: { ...expert, name }, reviewer: null };
  return { author: { name, credentials: null, bio: null }, reviewer: expert };
}

/** Dados públicos da empresa, para o rodapé/schema do site (GET /api/v1/site). */
export function siteOrganization(site: ContentSite) {
  const c = site.client;
  const expert = expertOf(site);
  return {
    name: organizationName(site),
    type: isLocalBusiness(site) ? ("LocalBusiness" as const) : ("Organization" as const),
    url: siteRoot(site),
    logo: c?.logo_url ?? null,
    brand_color: c?.brand_color ?? null,
    about: c?.about ?? null,
    services: c?.services ?? [],
    service_area: c?.service_area ?? null,
    address: c?.address ?? null,
    city: c?.city ?? null,
    state: c?.state ?? null,
    phone: c?.phone ?? null,
    opening_hours: c?.opening_hours ?? null,
    social_links: c?.social_links ?? [],
    expert,
  };
}

export function toSummary(site: ContentSite, post: PostFields, ps: PostSiteFields): PostSummary {
  const eff = effectiveContent(post, ps);
  const { author } = resolveAuthor(site, post.author_name);
  return {
    id: post.id,
    slug: eff.slug,
    title: eff.title,
    excerpt: eff.excerpt,
    answer_summary: eff.answer_summary,
    cover_image: post.cover_image_url ? { url: post.cover_image_url, alt: post.cover_image_alt ?? eff.title } : null,
    category: post.category,
    tags: post.tags ?? [],
    author: author?.name ?? null,
    author_profile: author,
    published_at: ps.published_at ?? post.published_at,
    updated_at: latest(post.updated_at, ps.updated_at),
    reading_minutes: post.reading_minutes || 1,
    url: publicUrl(site, eff.slug, ps.external_url),
  };
}

// ---------------------------------------------------------------------------
// JSON-LD (@graph schema.org)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Remove null, undefined, strings vazias, listas vazias e objetos que ficaram vazios. */
function compact(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const list = value.map(compact).filter((v) => v !== undefined);
    return list.length ? list : undefined;
  }
  if (typeof value === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      const c = compact(v);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function isLocalBusiness(site: Pick<ContentSite, "client">): boolean {
  return Boolean(site.client?.address || site.client?.city);
}

function ids(site: Pick<ContentSite, "url">) {
  const root = siteRoot(site);
  return {
    root,
    website: `${root}/#website`,
    organization: `${root}/#organization`,
    logo: `${root}/#logo`,
    person: (name: string) => `${root}/#/pessoa/${slugify(name) || "autor"}`,
  };
}

function organizationNode(site: ContentSite): Json {
  const id = ids(site);
  const c = site.client;
  const local = isLocalBusiness(site);
  return {
    "@type": local ? "LocalBusiness" : "Organization",
    "@id": id.organization,
    name: organizationName(site),
    url: id.root,
    logo: c?.logo_url ? { "@type": "ImageObject", "@id": id.logo, url: c.logo_url, contentUrl: c.logo_url } : undefined,
    image: local && c?.logo_url ? { "@id": id.logo } : undefined,
    description: c?.about,
    address:
      local && c
        ? {
            "@type": "PostalAddress",
            streetAddress: c.address,
            addressLocality: c.city,
            addressRegion: c.state,
            addressCountry: "BR",
          }
        : undefined,
    areaServed: c?.service_area ?? c?.city,
    telephone: c?.phone,
    openingHours: local ? c?.opening_hours : undefined,
    sameAs: c?.social_links,
    knowsAbout: c?.services,
  };
}

function websiteNode(site: ContentSite): Json {
  const id = ids(site);
  return {
    "@type": "WebSite",
    "@id": id.website,
    url: id.root,
    name: organizationName(site),
    publisher: { "@id": id.organization },
    inLanguage: "pt-BR",
  };
}

function personNode(site: ContentSite, person: AuthorProfile, worksForOrg: boolean): Json {
  const id = ids(site);
  return {
    "@type": "Person",
    "@id": id.person(person.name),
    name: person.name,
    jobTitle: person.credentials,
    description: person.bio,
    worksFor: worksForOrg ? { "@id": id.organization } : undefined,
  };
}

/** Grafo da página inicial/rodapé do site: Organization/LocalBusiness + WebSite. */
export function buildSiteJsonLd(site: ContentSite): Json {
  return compact({ "@context": "https://schema.org", "@graph": [organizationNode(site), websiteNode(site)] }) as Json;
}

const CONTENT_TYPE_SECTION: Record<ContentType, string | null> = {
  article: null,
  howto: "Passo a passo",
  guide: "Guia",
  list: "Lista",
  comparison: "Comparativo",
  news: "Notícias",
};

/**
 * JSON-LD do artigo como `@graph`: BlogPosting (NewsArticle em notícias), WebPage, BreadcrumbList,
 * WebSite, Organization/LocalBusiness, Person (autor e revisor), FAQPage e HowTo quando houver dados.
 * `@id` estáveis a partir das URLs; nunca emite null nem strings vazias.
 */
export function buildJsonLd(site: ContentSite, post: Omit<PublicPost, "json_ld">, wordCount?: number): Json {
  const id = ids(site);
  const pageUrl = post.url;
  const canonical = post.seo.canonical_url || pageUrl;
  const articleId = `${pageUrl}#article`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const expert = expertOf(site);
  const author = post.author_profile;
  const reviewer = author && expert && !sameName(author.name, expert.name) ? expert : null;
  const isExpert = (p: AuthorProfile) => !!expert && sameName(p.name, expert.name);
  const blogUrl = joinUrl(site.url, site.blog_path);

  const graph: Json[] = [];

  graph.push({
    "@type": post.content_type === "news" ? "NewsArticle" : "BlogPosting",
    "@id": articleId,
    headline: (post.seo.title || post.title).slice(0, 110),
    name: post.title,
    description: post.seo.description,
    abstract: post.answer_summary,
    image: post.cover_image ? [post.cover_image.url] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: author ? { "@id": id.person(author.name) } : { "@id": id.organization },
    publisher: { "@id": id.organization },
    mainEntityOfPage: { "@id": pageUrl },
    isPartOf: { "@id": id.website },
    url: canonical,
    articleSection: post.category ?? CONTENT_TYPE_SECTION[post.content_type],
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    wordCount: wordCount || undefined,
    inLanguage: "pt-BR",
    citation: post.sources.map((s) => ({
      "@type": "CreativeWork",
      name: s.title,
      url: s.url,
      publisher: s.publisher ? { "@type": "Organization", name: s.publisher } : undefined,
    })),
  });

  graph.push({
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: post.seo.title || post.title,
    description: post.seo.description,
    isPartOf: { "@id": id.website },
    breadcrumb: { "@id": breadcrumbId },
    primaryImageOfPage: post.cover_image ? { "@type": "ImageObject", url: post.cover_image.url } : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    reviewedBy: reviewer ? { "@id": id.person(reviewer.name) } : undefined,
    inLanguage: "pt-BR",
  });

  const crumbs: { name: string; url: string }[] = [{ name: "Início", url: id.root }];
  if (blogUrl !== id.root) crumbs.push({ name: "Blog", url: blogUrl });
  crumbs.push({ name: post.title, url: pageUrl });
  graph.push({
    "@type": "BreadcrumbList",
    "@id": breadcrumbId,
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  });

  graph.push(websiteNode(site), organizationNode(site));
  if (author) graph.push(personNode(site, author, isExpert(author)));
  if (reviewer) graph.push(personNode(site, reviewer, true));

  if (post.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      isPartOf: { "@id": id.website },
      inLanguage: "pt-BR",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  if (post.content_type === "howto") {
    const steps = orderedListSteps(post.content_html);
    if (steps) {
      graph.push({
        "@type": "HowTo",
        "@id": `${pageUrl}#howto`,
        name: post.title,
        description: post.answer_summary ?? post.seo.description,
        image: post.cover_image ? [post.cover_image.url] : undefined,
        mainEntityOfPage: { "@id": pageUrl },
        inLanguage: "pt-BR",
        step: steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
      });
    }
  }

  return compact({ "@context": "https://schema.org", "@graph": graph }) as Json;
}

/** Artigo completo no formato público. `canonicalUrl` = URL do site canônico quando for outro destino. */
export function toPublicPost(site: ContentSite, post: PostFields, ps: PostSiteFields, canonicalUrl: string | null): PublicPost {
  const summary = toSummary(site, post, ps);
  const eff = effectiveContent(post, ps);
  const base: Omit<PublicPost, "json_ld"> = {
    ...summary,
    // já é limpo ao salvar; limpa de novo na saída porque o embed injeta este HTML no site do cliente
    content_html: sanitizeArticleHtml(eff.content_html),
    key_takeaways: eff.key_takeaways,
    faq: eff.faq,
    sources: eff.sources,
    content_type: eff.content_type,
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
// Snapshot: a versão publicada em cada destino (post_sites.snapshot)
// ---------------------------------------------------------------------------
// O motor de entrega grava o snapshot a cada publicação/atualização bem-sucedida. A Content API
// serve só o snapshot, nunca os campos vivos de `posts`: o autosave do editor não muda os sites.
// O que depende do cadastro do site ou do cliente (URL, blog_path, autor padrão, especialista,
// dados da empresa no JSON-LD) é resolvido na leitura, para uma troca valer na hora sem republicar tudo.

/** Metadados internos do snapshot (não saem na API). */
export interface SnapshotMeta {
  version: 1;
  /** Autor do artigo; null = autor padrão do site ou especialista do cliente, resolvido na leitura. */
  author_name: string | null;
  /** Link real no WordPress, quando houver. */
  external_url: string | null;
  /** Destino canônico (outro site do mesmo artigo) no momento da publicação. */
  canonical_site_id: string | null;
  word_count: number;
  /** Slugs para filtrar ?category= e ?tag= direto no banco. */
  category_slug: string | null;
  tag_slugs: string[];
}

/** Conteúdo de `post_sites.snapshot`: o artigo no formato público + metadados internos. */
export type PostSnapshot = PublicPost & { snapshot_meta: SnapshotMeta };

/** Monta o snapshot de um destino. `ps` já deve trazer published_at/updated_at/external_url finais. */
export function buildSnapshot(
  site: ContentSite,
  post: PostFields,
  ps: PostSiteFields,
  canonical: { url: string; siteId: string } | null,
): PostSnapshot {
  const pub = toPublicPost(site, post, ps, canonical?.url ?? null);
  const category = pub.category?.trim() || null;
  return {
    ...pub,
    snapshot_meta: {
      version: 1,
      author_name: nonEmpty(post.author_name),
      external_url: ps.external_url,
      canonical_site_id: canonical?.siteId ?? null,
      word_count: post.word_count ?? 0,
      category_slug: category ? slugify(category) || null : null,
      tag_slugs: [...new Set(pub.tags.map((t) => slugify(t.trim())).filter(Boolean))],
    },
  };
}

/** Campos do snapshot usados nas listas (sem o HTML do artigo). Snapshots antigos podem não ter os de GEO. */
type SnapshotSummary = Pick<
  PostSnapshot,
  "id" | "slug" | "title" | "excerpt" | "cover_image" | "category" | "tags" | "published_at" | "updated_at" | "reading_minutes"
> & { answer_summary?: string | null; snapshot_meta?: Partial<SnapshotMeta> | null };

const SUMMARY_KEYS = [
  "id",
  "slug",
  "title",
  "excerpt",
  "answer_summary",
  "cover_image",
  "category",
  "tags",
  "published_at",
  "updated_at",
  "reading_minutes",
  "snapshot_meta",
] as const;
/** Seleciona só as chaves de resumo do JSON (o content_html fica no banco). */
const SUMMARY_COLUMNS: string = SUMMARY_KEYS.map((k) => `${k}:snapshot->${k}`).join(", ");

function summaryFromSnapshot(site: ContentSite, s: SnapshotSummary): PostSummary {
  const meta = s.snapshot_meta ?? {};
  const { author } = resolveAuthor(site, meta.author_name);
  return {
    id: s.id,
    slug: s.slug,
    title: s.title ?? "",
    excerpt: s.excerpt ?? "",
    answer_summary: cleanText(s.answer_summary, 2000),
    cover_image: s.cover_image ?? null,
    category: s.category ?? null,
    tags: s.tags ?? [],
    author: author?.name ?? null,
    author_profile: author,
    published_at: s.published_at ?? null,
    updated_at: s.updated_at,
    reading_minutes: s.reading_minutes || 1,
    url: publicUrl(site, s.slug, meta.external_url ?? null),
  };
}

function publicFromSnapshot(site: ContentSite, snap: PostSnapshot, canonicalUrl: string | null): PublicPost {
  const summary = summaryFromSnapshot(site, snap);
  const base: Omit<PublicPost, "json_ld"> = {
    ...summary,
    // já foi limpo ao publicar; limpa de novo na saída porque o embed injeta este HTML no site do cliente
    content_html: sanitizeArticleHtml(snap.content_html ?? ""),
    key_takeaways: cleanTextList(snap.key_takeaways),
    faq: cleanFaq(snap.faq),
    sources: cleanSources(snap.sources),
    content_type: cleanContentType(snap.content_type),
    seo: {
      title: snap.seo?.title || summary.title,
      description: snap.seo?.description || summary.excerpt,
      canonical_url: canonicalUrl ?? summary.url,
      og_image: summary.cover_image?.url ?? null,
    },
  };
  return { ...base, json_ld: buildJsonLd(site, base, snap.snapshot_meta?.word_count) };
}

// ---------------------------------------------------------------------------
// Consultas da Content API (sempre filtradas pelo site autenticado pela chave pública)
// ---------------------------------------------------------------------------

const KEY_RE = /^pk_[a-z0-9]{8,64}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidKeyFormat(key: string): boolean {
  return KEY_RE.test(key);
}

/** Normaliza o slug pedido pela API. Formato inválido = null (a rota responde 404). */
export function cleanSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 200 || !SLUG_RE.test(s)) return null;
  return s;
}

/** Busca o site pela chave pública. Nunca seleciona segredos. */
export async function getSiteByKey(key: string): Promise<ContentSite | null> {
  if (!isValidKeyFormat(key)) return null;
  const { data, error } = await db()
    .from("sites")
    .select(`id, name, url, blog_path, platform, status, default_author, indexnow_key, client:clients(${CONTENT_CLIENT_COLUMNS})`)
    .eq("public_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Omit<ContentSite, "client"> & { client: unknown };
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    blog_path: row.blog_path,
    platform: row.platform,
    status: row.status,
    default_author: row.default_author,
    indexnow_key: row.indexnow_key || null,
    client: toContentClient(row.client),
  };
}

/** Destinos no ar neste site: status 'published' e com snapshot gravado. */
function visibleQuery(siteId: string, columns: string, opts?: { count?: boolean }) {
  return db()
    .from("post_sites")
    .select(columns, opts?.count ? { count: "exact" } : undefined)
    .eq("site_id", siteId)
    .eq("status", "published")
    .not("snapshot", "is", null);
}

export type Taxonomy = { name: string; slug: string; count: number };

/** Categorias e tags dos artigos no ar no site, com contagem. */
export async function listTaxonomies(site: ContentSite): Promise<{ categories: Taxonomy[]; tags: Taxonomy[] }> {
  const { data, error } = await visibleQuery(site.id, "category:snapshot->category, tags:snapshot->tags").limit(5000);
  if (error) throw new Error(error.message);
  const cats = new Map<string, Taxonomy>();
  const tags = new Map<string, Taxonomy>();
  for (const row of (data ?? []) as unknown as { category: string | null; tags: string[] | null }[]) {
    const c = row.category?.trim();
    if (c) {
      const slug = slugify(c);
      const t = cats.get(slug) ?? { name: c, slug, count: 0 };
      t.count++;
      cats.set(slug, t);
    }
    for (const raw of row.tags ?? []) {
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
  let query = visibleQuery(site.id, SUMMARY_COLUMNS, { count: true });

  // category/tag aceitam o nome ou o slug (ex.: "Decoração" ou "decoracao").
  if (params.category) {
    const wanted = slugify(params.category);
    if (!wanted) return { data: [], total: 0 };
    query = query.eq("snapshot->snapshot_meta->>category_slug", wanted);
  }
  if (params.tag) {
    const wanted = slugify(params.tag);
    if (!wanted) return { data: [], total: 0 };
    query = query.filter("snapshot->snapshot_meta->tag_slugs", "cs", JSON.stringify([wanted]));
  }
  const q = params.q ? safeSearch(params.q) : "";
  if (q) query = query.or(`snapshot->>title.ilike.*${q}*,snapshot->>excerpt.ilike.*${q}*`);

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
  const rows = (data ?? []) as unknown as SnapshotSummary[];
  return { data: rows.map((r) => summaryFromSnapshot(site, r)), total: count ?? rows.length };
}

/**
 * URL do destino canônico gravado no snapshot, se ele continuar no ar.
 * Se o site canônico saiu do ar, o artigo volta a apontar para si mesmo.
 */
async function liveCanonicalUrl(postId: string, siteId: string, canonicalSiteId: string | null | undefined): Promise<string | null> {
  if (!canonicalSiteId || canonicalSiteId === siteId) return null;
  const { data } = await db()
    .from("post_sites")
    .select("slug:snapshot->>slug, meta:snapshot->snapshot_meta, site:sites(url, blog_path, platform)")
    .eq("post_id", postId)
    .eq("site_id", canonicalSiteId)
    .eq("status", "published")
    .not("snapshot", "is", null)
    .limit(1);
  const row = data?.[0] as
    | {
        slug: string | null;
        meta: Partial<SnapshotMeta> | null;
        site: CanonicalSite | CanonicalSite[] | null;
      }
    | undefined;
  const target = Array.isArray(row?.site) ? row.site[0] : row?.site;
  if (!row?.slug || !target) return null;
  return publicUrl(target, row.slug, row.meta?.external_url ?? null);
}

type CanonicalSite = { url: string; blog_path: string; platform: SitePlatform };

export async function getPublishedPost(site: ContentSite, slug: string): Promise<PublicPost | null> {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const { data, error } = await visibleQuery(site.id, "snapshot")
    .eq("snapshot->>slug", clean)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const snap = (data?.[0] as unknown as { snapshot: PostSnapshot } | undefined)?.snapshot;
  if (!snap) return null;
  const canonical = await liveCanonicalUrl(snap.id, site.id, snap.snapshot_meta?.canonical_site_id);
  return publicFromSnapshot(site, snap, canonical);
}

/** Resolve só o id do artigo no ar pelo slug (usado pelo contador de visualizações). */
export async function findVisiblePostId(site: ContentSite, slug: string): Promise<string | null> {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const { data, error } = await visibleQuery(site.id, "post_id").eq("snapshot->>slug", clean).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as { post_id: string } | undefined)?.post_id ?? null;
}

/** Artigos completos mais recentes (feed RSS). */
export async function listRecentFull(site: ContentSite, limit: number): Promise<PublicPost[]> {
  const { data, error } = await visibleQuery(site.id, "snapshot")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { snapshot: PostSnapshot }[]).map((r) => publicFromSnapshot(site, r.snapshot, null));
}

/** Todos os artigos no ar (sitemap). */
export async function listAllSummaries(site: ContentSite, limit = 5000): Promise<PostSummary[]> {
  const { data, error } = await visibleQuery(site.id, SUMMARY_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SnapshotSummary[]).map((r) => summaryFromSnapshot(site, r));
}

/** Escapa texto para XML (sitemap, RSS). */
export function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}
