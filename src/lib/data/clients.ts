import "server-only";
import { parseUnits } from "@/lib/units";
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
    services: c.services ?? [],
    social_links: c.social_links ?? [],
    units: parseUnits(c.units),
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
  return {
    ...client,
    keywords: client.keywords ?? [],
    services: client.services ?? [],
    social_links: client.social_links ?? [],
    units: parseUnits(client.units),
  };
});

/** Opção de cliente para seletores (ex.: Pautas). */
export type ClientOption = Pick<Client, "id" | "name" | "segment" | "city" | "state" | "status" | "brand_color"> & {
  /** Campos do perfil ainda vazios que dariam mais contexto à IA. */
  profileGaps: string[];
};

/** Clientes ativos e pausados (sem arquivados), em ordem alfabética, com o que falta no perfil para a IA. */
export async function listClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await db()
    .from("clients")
    .select("id, name, segment, city, state, status, brand_color, about, services, audience, keywords")
    .neq("status", "archived");
  if (error) throw new Error(`Não foi possível carregar os clientes: ${error.message}`);
  type Row = Pick<Client, "id" | "name" | "segment" | "city" | "state" | "status" | "brand_color" | "about" | "audience"> & {
    services: string[] | null;
    keywords: string[] | null;
  };
  return ((data ?? []) as Row[])
    .map(({ about, services, audience, keywords, ...c }) => ({
      ...c,
      profileGaps: [
        !c.segment && "segmento",
        !about && "sobre a empresa",
        !services?.length && "serviços",
        !audience && "público-alvo",
        !keywords?.length && "palavras-chave",
      ].filter((g): g is string => Boolean(g)),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

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
