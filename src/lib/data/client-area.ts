import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { siteArticleUrl } from "@/lib/delivery/urls";

// Dados da área do cliente (/cliente). Toda consulta recebe o clientId da conta logada (requireClient).

export type PortalItem = {
  id: string;
  title: string;
  excerpt: string | null;
  cover: string | null;
  status: "awaiting" | "changes" | "published";
  date: string;
  feedback: string | null;
  url: string | null;
};

const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);

/** O que o cliente vê: artigos para aprovar, em ajuste e os últimos publicados. */
export const listPortalItems = cache(async function listPortalItems(clientId: string): Promise<PortalItem[]> {
  const [pending, live] = await Promise.all([
    db()
      .from("posts")
      .select("id, title, excerpt, cover_image_url, approval_status, approval_requested_at, approval_feedback, status")
      .eq("approval_client_id", clientId)
      .in("approval_status", ["awaiting", "changes"])
      .neq("status", "published")
      .order("approval_requested_at", { ascending: false })
      .limit(50),
    db()
      .from("post_sites")
      .select("post_id, slug, external_url, published_at, posts!inner(id, title, excerpt, cover_image_url, slug), sites!inner(url, blog_path, client_id)")
      .eq("status", "published")
      .eq("sites.client_id", clientId)
      .order("published_at", { ascending: false })
      .limit(100),
  ]);

  type P = { id: string; title: string; excerpt: string | null; cover_image_url: string | null; approval_status: "awaiting" | "changes"; approval_requested_at: string | null; approval_feedback: string | null };
  const items: PortalItem[] = ((pending.data ?? []) as P[]).map((p) => ({
    id: p.id,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover_image_url,
    status: p.approval_status,
    date: p.approval_requested_at ?? new Date().toISOString(),
    feedback: p.approval_feedback,
    url: null,
  }));

  type L = {
    post_id: string;
    slug: string | null;
    external_url: string | null;
    published_at: string | null;
    posts: { id: string; title: string; excerpt: string | null; cover_image_url: string | null; slug: string } | { id: string; title: string; excerpt: string | null; cover_image_url: string | null; slug: string }[];
    sites: { url: string; blog_path: string; client_id: string } | { url: string; blog_path: string; client_id: string }[];
  };
  const seen = new Set<string>();
  for (const row of (live.data ?? []) as unknown as L[]) {
    const post = one(row.posts);
    const site = one(row.sites);
    if (!post || !site || seen.has(post.id)) continue;
    seen.add(post.id);
    items.push({
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      cover: post.cover_image_url,
      status: "published",
      date: row.published_at ?? new Date().toISOString(),
      feedback: null,
      url: row.external_url ?? siteArticleUrl(site, row.slug ?? post.slug),
    });
  }
  return items;
});

/** Artigo da área do cliente, só se for mesmo deste cliente. */
export async function getPortalPost(clientId: string, postId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const { data } = await db()
    .from("posts")
    .select(
      "id, title, excerpt, content_html, cover_image_url, cover_image_alt, answer_summary, key_takeaways, faq, reading_minutes, author_name, created_at, status, approval_status, approval_client_id, approval_feedback",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!data) return null;
  const post = data as {
    id: string;
    title: string;
    excerpt: string | null;
    content_html: string;
    cover_image_url: string | null;
    cover_image_alt: string | null;
    answer_summary: string | null;
    key_takeaways: unknown;
    faq: unknown;
    reading_minutes: number | null;
    author_name: string | null;
    created_at: string;
    status: string;
    approval_status: "awaiting" | "changes" | "approved" | "rejected" | null;
    approval_client_id: string | null;
    approval_feedback: string | null;
  };
  let mine = post.approval_client_id === clientId;
  let url: string | null = null;
  const { data: links } = await db()
    .from("post_sites")
    .select("status, slug, external_url, sites!inner(url, blog_path, client_id)")
    .eq("post_id", postId)
    .eq("sites.client_id", clientId);
  type Link = { status: string; slug: string | null; external_url: string | null; sites: { url: string; blog_path: string } | { url: string; blog_path: string }[] };
  for (const l of (links ?? []) as unknown as Link[]) {
    mine = true;
    const site = one(l.sites);
    if (l.status === "published" && site) url = l.external_url ?? siteArticleUrl(site, l.slug ?? "");
  }
  return mine ? { ...post, url } : null;
}

export type PortalTopic = {
  id: string;
  title: string;
  notes: string | null;
  source: "equipe" | "cliente";
  status: "pending" | "used";
  created_at: string;
  used_at: string | null;
  post_id: string | null;
};

/** Temas do cliente: os que estão na fila (na ordem em que viram artigo) e os que já viraram artigo. */
export async function listPortalTopics(clientId: string): Promise<{ queue: PortalTopic[]; done: PortalTopic[] }> {
  const cols = "id, title, notes, source, status, created_at, used_at, post_id";
  const [queue, done] = await Promise.all([
    db().from("client_topics").select(cols).eq("client_id", clientId).eq("status", "pending").order("created_at").limit(50),
    db().from("client_topics").select(cols).eq("client_id", clientId).eq("status", "used").order("used_at", { ascending: false }).limit(12),
  ]);
  return { queue: (queue.data ?? []) as PortalTopic[], done: (done.data ?? []) as PortalTopic[] };
}

/** Números do início: o que espera o cliente, o que está com a OutBox e o que já foi ao ar. */
export function summarize(items: PortalItem[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const published = items.filter((i) => i.status === "published");
  return {
    awaiting: items.filter((i) => i.status === "awaiting").length,
    changes: items.filter((i) => i.status === "changes").length,
    published: published.length,
    publishedThisMonth: published.filter((i) => new Date(i.date).getTime() >= monthStart).length,
  };
}
