// Constantes do módulo Clientes e Sites, compartilhadas entre servidor e cliente.
import type { ClientStatus, DeliveryChannel, DeliveryEvent, SitePlatform } from "@/lib/types";

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const CLIENT_STATUSES = ["active", "paused", "archived"] as const satisfies readonly ClientStatus[];

export const CLIENT_STATUS: Record<ClientStatus, { label: string; filter: string; tone: "ok" | "warn" | "neutral" }> = {
  active: { label: "Ativo", filter: "Ativos", tone: "ok" },
  paused: { label: "Pausado", filter: "Pausados", tone: "warn" },
  archived: { label: "Arquivado", filter: "Arquivados", tone: "neutral" },
};

/** Ordem de exibição no formulário: o site OutBox (padrão) primeiro. */
export const SITE_PLATFORMS = ["api", "wordpress", "webhook"] as const satisfies readonly SitePlatform[];

export const DEFAULT_PLATFORM: SitePlatform = "api";

export const PLATFORM: Record<SitePlatform, { label: string; description: string }> = {
  api: {
    label: "Site OutBox (Content API)",
    description: "Site feito pela OutBox. Os artigos entram no ar na hora, com SEO e GEO prontos. Serve também para o script de embed.",
  },
  wordpress: { label: "WordPress", description: "O CMS cria o post direto no WordPress do cliente." },
  webhook: { label: "Webhook", description: "O CMS envia cada publicação para uma URL (n8n, Zapier ou outro sistema)." },
};

/** Rota do starter OutBox que revalida o blog a cada publicação. */
export const OUTBOX_REVALIDATE_PATH = "/api/outbox/revalidate";

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  api: "Content API",
  wordpress: "WordPress",
  webhook: "Webhook",
};

export const EVENT_LABEL: Record<DeliveryEvent, string> = {
  publish: "Publicação",
  update: "Atualização",
  unpublish: "Despublicação",
  test: "Teste",
};

/** Tom do indicador de conexão a partir de `sites.last_check_ok`. */
export function connectionTone(ok: boolean | null): "ok" | "danger" | "neutral" {
  return ok === true ? "ok" : ok === false ? "danger" : "neutral";
}

export function connectionLabel(ok: boolean | null): string {
  return ok === true ? "Conexão funcionando" : ok === false ? "Conexão com falha" : "Conexão ainda não testada";
}
