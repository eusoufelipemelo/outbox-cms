import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/data/sites";
import type { Client, ClientStatus, PostStatus, PublicationStatus, Site } from "@/lib/types";

export type ClientSiteSummary = Pick<Site, "id" | "name" | "url" | "platform" | "status" | "last_check_ok">;

/** Cliente com o resumo dos seus sites (sem segredos). */
export type ClientListItem = Client & { sites: ClientSiteSummary[] };

export type ClientPublication = {
  id: string;
  post_id: string;
  site_id: string;
  status: PublicationStatus;
  published_at: string | null;
  updated_at: string;
  external_url: string | null;
  post: { id: string; title: string; status: PostStatus } | null;
  site: { id: string; name: string } | null;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function fold(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Clientes em ordem alfabética, com seus sites.
 * `q` busca (sem acento) em nome, razão social, segmento, cidade, UF e endereço dos sites.
 */
export async function listClients(filters: { q?: string; status?: ClientStatus } = {}): Promise<ClientListItem[]> {
  let query = db().from("clients").select("*, sites(id, name, url, platform, status, last_check_ok)");
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar os clientes: ${error.message}`);

  let rows = ((data ?? []) as ClientListItem[]).map((c) => ({
    ...c,
    keywords: c.keywords ?? [],
    sites: [...(c.sites ?? [])].sort((a, b) => collator.compare(a.name, b.name)),
  }));

  const q = fold(filters.q).trim();
  if (q) {
    rows = rows.filter((c) =>
      [c.name, c.legal_name, c.segment, c.city, c.state, c.contact_name, ...c.sites.map((s) => s.url)].some((v) => fold(v).includes(q)),
    );
  }
  return rows.sort((a, b) => collator.compare(a.name, b.name));
}

export const getClient = cache(async function getClient(id: string): Promise<Client | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o cliente: ${error.message}`);
  if (!data) return null;
  const client = data as Client;
  return { ...client, keywords: client.keywords ?? [] };
});

/** Últimas publicações (artigo x site) nos sites do cliente. */
export async function listClientPublications(siteIds: string[], limit = 10): Promise<ClientPublication[]> {
  if (siteIds.length === 0) return [];
  const { data, error } = await db()
    .from("post_sites")
    .select("id, post_id, site_id, status, published_at, updated_at, external_url, post:posts(id, title, status), site:sites(id, name)")
    .in("site_id", siteIds)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Não foi possível carregar as publicações: ${error.message}`);
  return (data ?? []) as unknown as ClientPublication[];
}
