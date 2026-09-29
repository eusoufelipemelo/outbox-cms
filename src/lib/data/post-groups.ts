import "server-only";
import { db } from "@/lib/supabase/admin";
import type { PostStatus } from "@/lib/types";
import type { PostListFilter } from "./posts";

/** Artigos agrupados por cliente (visão "Por cliente" da tela Artigos). */

export type GroupPost = { id: string; title: string; status: PostStatus; updatedAt: string; scheduledAt: string | null };
export type ArticleGroup = {
  clientId: string | null;
  name: string;
  color: string | null;
  total: number;
  counts: Partial<Record<PostStatus, number>>;
  lastUpdate: string;
  posts: GroupPost[];
};

type Row = {
  id: string;
  title: string | null;
  status: PostStatus;
  updated_at: string;
  scheduled_at: string | null;
  post_sites: { site: { client: { id: string; name: string; brand_color: string | null } | { id: string; name: string; brand_color: string | null }[] | null } | null }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function listArticleGroups(status: PostListFilter, q?: string): Promise<ArticleGroup[]> {
  let query = db()
    .from("posts")
    .select("id, title, status, updated_at, scheduled_at, post_sites(site:sites(client:clients(id, name, brand_color)))")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (status === "all") query = query.neq("status", "archived");
  else query = query.eq("status", status);
  const term = q?.trim().slice(0, 120);
  if (term) query = query.ilike("title", `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar os artigos: ${error.message}`);

  const groups = new Map<string, ArticleGroup>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const clients = new Map<string, { id: string; name: string; brand_color: string | null }>();
    for (const l of r.post_sites ?? []) {
      const c = one(l.site?.client ?? null);
      if (c) clients.set(c.id, c);
    }
    const targets = clients.size ? [...clients.values()] : [null];
    for (const c of targets) {
      const key = c?.id ?? "_sem";
      const g =
        groups.get(key) ??
        ({ clientId: c?.id ?? null, name: c?.name ?? "Sem site de destino", color: c?.brand_color ?? null, total: 0, counts: {}, lastUpdate: r.updated_at, posts: [] } as ArticleGroup);
      g.total++;
      g.counts[r.status] = (g.counts[r.status] ?? 0) + 1;
      if (r.updated_at > g.lastUpdate) g.lastUpdate = r.updated_at;
      if (g.posts.length < 8) g.posts.push({ id: r.id, title: r.title ?? "", status: r.status, updatedAt: r.updated_at, scheduledAt: r.scheduled_at });
      groups.set(key, g);
    }
  }
  return [...groups.values()].sort((a, b) => (a.clientId === null ? 1 : b.clientId === null ? -1 : b.lastUpdate.localeCompare(a.lastUpdate)));
}
