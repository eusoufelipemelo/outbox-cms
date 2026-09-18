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

export const SITE_PLATFORMS = ["api", "wordpress", "webhook"] as const satisfies readonly SitePlatform[];

export const PLATFORM: Record<SitePlatform, { label: string; description: string }> = {
  api: { label: "Content API", description: "O site busca os artigos pela API ou pelo script de embed." },
  wordpress: { label: "WordPress", description: "O CMS cria o post direto no WordPress." },
  webhook: { label: "Webhook", description: "O CMS avisa o site a cada publicação." },
};

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
