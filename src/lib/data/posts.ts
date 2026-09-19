import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { isContentType } from "@/lib/geo";
import type { ContentType, FaqItem, PostStatus, PublicationStatus, SitePlatform } from "@/lib/types";
import type {
  DestinationDraft,
  DestinationSite,
  EditorPost,
  Publication,
  RevisionItem,
  SourceDraft,
} from "@/components/editor/types";

// Colunas seguras de sites: nunca inclua wp_app_password / webhook_secret aqui.
const SITE_COLUMNS =
  "id,name,url,blog_path,platform,status,client:clients(id,name,brand_color,city,state,expert_name,expert_credentials)";

const PUBLICATION_COLUMNS =
  "site_id,status,is_canonical,external_url,last_error,published_at,snapshot_at,override_title,override_excerpt,override_content_html,override_seo_title,override_seo_description,override_answer_summary,override_faq";

const GEO_COLUMNS = "answer_summary,key_takeaways,faq,sources,content_type";

type Row = Record<string, unknown>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toSite(row: Row): DestinationSite {
  const client = one(row.client as Row | Row[] | null) ?? {};
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    blog_path: (row.blog_path as string) ?? "/blog",
    platform: row.platform as SitePlatform,
    status: row.status as "active" | "paused",
    client: {
      id: (client.id as string) ?? "",
      name: (client.name as string) ?? "Sem cliente",
      brand_color: (client.brand_color as string | null) ?? null,
      city: (client.city as string | null) ?? null,
      state: (client.state as string | null) ?? null,
      expert_name: (client.expert_name as string | null) ?? null,
      expert_credentials: (client.expert_credentials as string | null) ?? null,
    },
  };
}

// ---- GEO: jsonb/text[] chegam como unknown; normaliza sem confiar no formato ----

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Row => Boolean(x) && typeof x === "object")
    .map((x) => ({ question: str(x.question), answer: str(x.answer) }))
    .filter((x) => x.question || x.answer);
}

export function toSources(value: unknown): SourceDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Row => Boolean(x) && typeof x === "object")
    .map((x) => ({ title: str(x.title), url: str(x.url), publisher: str(x.publisher) }))
    .filter((x) => x.title || x.url);
}

function toTakeaways(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function toContentType(value: unknown): ContentType {
  return isContentType(value) ? value : "article";
}

export function toPublication(row: Row): Publication {
  return {
    siteId: row.site_id as string,
    status: row.status as PublicationStatus,
    isCanonical: Boolean(row.is_canonical),
    externalUrl: (row.external_url as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    snapshotAt: (row.snapshot_at as string | null) ?? null,
  };
}

function toDestination(row: Row): DestinationDraft {
  return {
    siteId: row.site_id as string,
    isCanonical: Boolean(row.is_canonical),
    overrideTitle: (row.override_title as string | null) ?? "",
    overrideExcerpt: (row.override_excerpt as string | null) ?? "",
    overrideContentHtml: (row.override_content_html as string | null) ?? "",
    overrideSeoTitle: (row.override_seo_title as string | null) ?? "",
    overrideSeoDescription: (row.override_seo_description as string | null) ?? "",
    overrideAnswerSummary: (row.override_answer_summary as string | null) ?? "",
    overrideFaq: toFaq(row.override_faq),
  };
}

/** Nomes da equipe (auth.users), para autor de artigos e do histórico. */
export const getUserNames = cache(async (): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const { data, error } = await db().auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error || !data) return map;
  for (const u of data.users) {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const email = u.email ?? "";
    map.set(u.id, (typeof meta.name === "string" && meta.name) || email.split("@")[0] || "Equipe");
  }
  return map;
});

/** Sites que podem receber artigos, com o cliente. Ordenados por cliente e nome. */
export async function listDestinationSites(): Promise<DestinationSite[]> {
  const { data, error } = await db().from("sites").select(SITE_COLUMNS).order("name");
  if (error) throw new Error(`Não foi possível carregar os sites: ${error.message}`);
  return ((data ?? []) as Row[])
    .map(toSite)
    .sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
}

export async function listClientOptions(): Promise<{ id: string; name: string; brand_color: string | null }[]> {
  const { data } = await db().from("clients").select("id,name,brand_color").neq("status", "archived").order("name");
  return (data ?? []) as { id: string; name: string; brand_color: string | null }[];
}

export async function listCategorySuggestions(): Promise<string[]> {
  const { data } = await db().from("posts").select("category").not("category", "is", null).limit(1000);
  const set = new Set<string>();
  for (const row of (data ?? []) as { category: string | null }[]) if (row.category) set.add(row.category);
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ============ Lista de artigos ============

export type PostListFilter = "all" | PostStatus;

export interface PostListItem {
  id: string;
  title: string;
  snippet: string;
  status: PostStatus;
  scheduledAt: string | null;
  updatedAt: string;
  author: string | null;
  destinations: {
    siteId: string;
    name: string;
    url: string;
    status: PublicationStatus;
    isCanonical: boolean;
    clientName: string;
    clientColor: string | null;
  }[];
}

export const POSTS_PAGE_SIZE = 30;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listPosts(opts: {
  status: PostListFilter;
  q?: string;
  clientId?: string;
  page?: number;
}): Promise<{ posts: PostListItem[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  let postIds: string[] | null = null;

  if (opts.clientId) {
    const { data: sites } = await db().from("sites").select("id").eq("client_id", opts.clientId);
    const siteIds = ((sites ?? []) as { id: string }[]).map((s) => s.id);
    if (siteIds.length === 0) return { posts: [], total: 0 };
    const { data: links } = await db().from("post_sites").select("post_id").in("site_id", siteIds);
    postIds = [...new Set(((links ?? []) as { post_id: string }[]).map((l) => l.post_id))];
    if (postIds.length === 0) return { posts: [], total: 0 };
  }

  let query = db()
    .from("posts")
    .select(
      `id,title,excerpt,seo_description,status,scheduled_at,updated_at,author_name,created_by,
       post_sites(site_id,status,is_canonical,site:sites(id,name,url,client:clients(name,brand_color)))`,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range((page - 1) * POSTS_PAGE_SIZE, page * POSTS_PAGE_SIZE - 1);

  if (opts.status === "all") query = query.neq("status", "archived");
  else query = query.eq("status", opts.status);
  const q = opts.q?.trim().slice(0, 120);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  if (postIds) query = query.in("id", postIds);

  const [{ data, count, error }, names] = await Promise.all([query, getUserNames()]);
  if (error) throw new Error(`Não foi possível carregar os artigos: ${error.message}`);

  const posts = ((data ?? []) as Row[]).map((row): PostListItem => {
    const links = (row.post_sites as Row[] | null) ?? [];
    return {
      id: row.id as string,
      title: (row.title as string) || "",
      snippet: ((row.excerpt as string | null) || (row.seo_description as string | null) || "").trim(),
      status: row.status as PostStatus,
      scheduledAt: (row.scheduled_at as string | null) ?? null,
      updatedAt: row.updated_at as string,
      author: (row.author_name as string | null) || (row.created_by ? (names.get(row.created_by as string) ?? null) : null),
      destinations: links
        .map((l) => {
          const site = one(l.site as Row | Row[] | null);
          if (!site) return null;
          const client = one(site.client as Row | Row[] | null) ?? {};
          return {
            siteId: l.site_id as string,
            name: site.name as string,
            url: site.url as string,
            status: l.status as PublicationStatus,
            isCanonical: Boolean(l.is_canonical),
            clientName: (client.name as string) ?? "",
            clientColor: (client.brand_color as string | null) ?? null,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => Number(b.isCanonical) - Number(a.isCanonical)),
    };
  });

  return { posts, total: count ?? posts.length };
}

export async function countPostsByStatus(): Promise<Record<PostListFilter, number>> {
  const statuses: PostStatus[] = ["draft", "scheduled", "published", "archived"];
  const results = await Promise.all(
    statuses.map((s) => db().from("posts").select("id", { count: "exact", head: true }).eq("status", s)),
  );
  const counts = { all: 0, draft: 0, scheduled: 0, published: 0, archived: 0 } as Record<PostListFilter, number>;
  statuses.forEach((s, i) => {
    counts[s] = results[i].count ?? 0;
  });
  counts.all = counts.draft + counts.scheduled + counts.published;
  return counts;
}

// ============ Editor ============

export async function listRevisions(postId: string, limit = 30): Promise<RevisionItem[]> {
  const [{ data }, names] = await Promise.all([
    db()
      .from("post_revisions")
      .select("id,title,created_by,created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(limit),
    getUserNames(),
  ]);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    title: (r.title as string | null) ?? null,
    authorName: r.created_by ? (names.get(r.created_by as string) ?? null) : null,
  }));
}

export async function listPublications(postId: string): Promise<Publication[]> {
  const { data } = await db().from("post_sites").select(PUBLICATION_COLUMNS).eq("post_id", postId).order("created_at");
  return ((data ?? []) as Row[]).map(toPublication);
}

export const getPostForEditor = cache(async (id: string): Promise<EditorPost | null> => {
  const [{ data: post, error }, { data: links }, revisions] = await Promise.all([
    db()
      .from("posts")
      .select(
        `id,title,slug,excerpt,content_html,cover_image_url,cover_image_alt,category,tags,author_name,seo_title,seo_description,focus_keyword,status,scheduled_at,published_at,updated_at,${GEO_COLUMNS}`,
      )
      .eq("id", id)
      .maybeSingle(),
    db().from("post_sites").select(PUBLICATION_COLUMNS).eq("post_id", id).order("created_at"),
    listRevisions(id),
  ]);
  if (error || !post) return null;
  const p = post as Row;
  const rows = (links ?? []) as Row[];
  return {
    id: p.id as string,
    title: (p.title as string) ?? "",
    slug: (p.slug as string) ?? "",
    excerpt: (p.excerpt as string | null) ?? "",
    contentHtml: (p.content_html as string) ?? "",
    coverImageUrl: (p.cover_image_url as string | null) ?? "",
    coverImageAlt: (p.cover_image_alt as string | null) ?? "",
    category: (p.category as string | null) ?? "",
    tags: (p.tags as string[] | null) ?? [],
    authorName: (p.author_name as string | null) ?? "",
    seoTitle: (p.seo_title as string | null) ?? "",
    seoDescription: (p.seo_description as string | null) ?? "",
    focusKeyword: (p.focus_keyword as string | null) ?? "",
    answerSummary: (p.answer_summary as string | null) ?? "",
    keyTakeaways: toTakeaways(p.key_takeaways),
    faq: toFaq(p.faq),
    sources: toSources(p.sources),
    contentType: toContentType(p.content_type),
    status: p.status as PostStatus,
    scheduledAt: (p.scheduled_at as string | null) ?? null,
    publishedAt: (p.published_at as string | null) ?? null,
    updatedAt: p.updated_at as string,
    // destinos atuais: tudo menos o que já foi despublicado
    destinations: rows.filter((r) => r.status !== "unpublished").map(toDestination),
    publications: rows.map(toPublication),
    revisions,
  };
});

// ============ Pré-visualização ============

export interface PreviewData {
  post: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    contentHtml: string;
    coverImageUrl: string | null;
    coverImageAlt: string | null;
    category: string | null;
    tags: string[];
    /** Autor escrito no artigo (vazio = cada site usa o autor padrão). */
    authorName: string | null;
    /** Autor para exibir: o do artigo ou quem criou. */
    author: string | null;
    readingMinutes: number;
    answerSummary: string | null;
    keyTakeaways: string[];
    faq: FaqItem[];
    sources: SourceDraft[];
    contentType: ContentType;
    status: PostStatus;
    publishedAt: string | null;
    updatedAt: string;
  };
  sites: (DestinationSite & {
    publication: Publication;
    override: DestinationDraft;
    defaultAuthor: string | null;
    expertBio: string | null;
  })[];
}

const PREVIEW_SITE_COLUMNS =
  "id,name,url,blog_path,platform,status,default_author,client:clients(id,name,brand_color,city,state,expert_name,expert_credentials,expert_bio)";

export async function getPostPreview(id: string): Promise<PreviewData | null> {
  const [{ data: post }, { data: links }, names] = await Promise.all([
    db()
      .from("posts")
      .select(
        `id,title,slug,excerpt,content_html,cover_image_url,cover_image_alt,category,tags,author_name,created_by,reading_minutes,status,published_at,updated_at,${GEO_COLUMNS}`,
      )
      .eq("id", id)
      .maybeSingle(),
    db()
      .from("post_sites")
      .select(`${PUBLICATION_COLUMNS},site:sites(${PREVIEW_SITE_COLUMNS})`)
      .eq("post_id", id)
      .neq("status", "unpublished")
      .order("created_at"),
    getUserNames(),
  ]);
  if (!post) return null;
  const p = post as Row;
  const sites = ((links ?? []) as Row[])
    .map((row) => {
      const site = one(row.site as Row | Row[] | null);
      if (!site) return null;
      const client = one(site.client as Row | Row[] | null) ?? {};
      return {
        ...toSite(site),
        publication: toPublication(row),
        override: toDestination(row),
        defaultAuthor: (site.default_author as string | null) ?? null,
        expertBio: (client.expert_bio as string | null) ?? null,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    post: {
      id: p.id as string,
      title: (p.title as string) ?? "",
      slug: (p.slug as string) ?? "",
      excerpt: (p.excerpt as string | null) ?? null,
      contentHtml: (p.content_html as string) ?? "",
      coverImageUrl: (p.cover_image_url as string | null) ?? null,
      coverImageAlt: (p.cover_image_alt as string | null) ?? null,
      category: (p.category as string | null) ?? null,
      tags: (p.tags as string[] | null) ?? [],
      authorName: (p.author_name as string | null) || null,
      author: (p.author_name as string | null) || (p.created_by ? (names.get(p.created_by as string) ?? null) : null),
      readingMinutes: (p.reading_minutes as number) ?? 0,
      answerSummary: (p.answer_summary as string | null) || null,
      keyTakeaways: toTakeaways(p.key_takeaways),
      faq: toFaq(p.faq),
      sources: toSources(p.sources),
      contentType: toContentType(p.content_type),
      status: p.status as PostStatus,
      publishedAt: (p.published_at as string | null) ?? null,
      updatedAt: p.updated_at as string,
    },
    sites,
  };
}
