import "server-only";
import { db } from "@/lib/supabase/admin";
import type { Delivery, Site, SiteWithClient } from "@/lib/types";

/** Site sem segredos: seguro para enviar a componentes cliente. */
export type SafeSite = Omit<SiteWithClient, "wp_app_password" | "webhook_secret">;

/** Site sem segredos e sem o cliente embutido. */
export type PublicSite = Omit<Site, "wp_app_password" | "webhook_secret">;

/** Dados do site para o formulário de edição: nunca inclui a senha do WordPress. */
export type SiteFormValues = PublicSite & { has_wp_password: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Colunas sem wp_app_password e webhook_secret.
const SAFE_COLUMNS = [
  "id",
  "client_id",
  "name",
  "url",
  "blog_path",
  "platform",
  "public_key",
  "webhook_url",
  "wp_url",
  "wp_username",
  "wp_default_status",
  "default_author",
  "default_category",
  "status",
  "last_check_at",
  "last_check_ok",
  "last_check_message",
  "created_at",
  "updated_at",
].join(",");

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** Todos os sites com o cliente, ordenados por cliente e depois por site. Sem segredos. */
export async function listSitesWithClients(): Promise<SafeSite[]> {
  const { data, error } = await db().from("sites").select(`${SAFE_COLUMNS}, client:clients!inner(id, name, brand_color, city, state)`);
  if (error) throw new Error(`Não foi possível carregar os sites: ${error.message}`);
  const rows = (data ?? []) as unknown as SafeSite[];
  return rows.sort((a, b) => collator.compare(a.client.name, b.client.name) || collator.compare(a.name, b.name));
}

/** Linha completa do site, incluindo segredos. Uso exclusivo no servidor. */
export async function getSite(id: string): Promise<Site | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("sites").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o site: ${error.message}`);
  return (data as Site | null) ?? null;
}

/** Sites de um cliente, sem segredos, em ordem alfabética. */
export async function listClientSites(clientId: string): Promise<PublicSite[]> {
  if (!isUuid(clientId)) return [];
  const { data, error } = await db().from("sites").select(SAFE_COLUMNS).eq("client_id", clientId).order("name");
  if (error) throw new Error(`Não foi possível carregar os sites: ${error.message}`);
  return (data ?? []) as unknown as PublicSite[];
}

/** Últimas entregas registradas para o site. */
export async function listSiteDeliveries(siteId: string, limit = 20): Promise<Delivery[]> {
  if (!isUuid(siteId)) return [];
  const { data, error } = await db()
    .from("deliveries")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Não foi possível carregar as entregas: ${error.message}`);
  return (data ?? []) as Delivery[];
}

/** Remove a senha do WordPress antes de enviar o site ao formulário. */
export function toSiteFormValues(site: Site): SiteFormValues {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { wp_app_password, webhook_secret, ...rest } = site;
  return { ...rest, has_wp_password: Boolean(wp_app_password) };
}
