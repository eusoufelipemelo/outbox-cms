import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getClient, listClientPublications } from "@/lib/data/clients";
import { listClientSites } from "@/lib/data/sites";
import { Badge, PublicationBadge, StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { BackLink, BrandDot, ConnectionDot } from "@/components/clients/bits";
import { ClientForm } from "@/components/clients/client-form";
import { DeleteClientPanel } from "@/components/clients/delete-client";
import { CLIENT_STATUS, PLATFORM } from "@/components/clients/options";
import type { Client } from "@/lib/types";
import { formatDate, hostname } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.name ?? "Cliente" };
}

function describe(client: Client): string | undefined {
  const place = client.city && client.state ? `${client.city}, ${client.state}` : client.city || client.state;
  if (client.segment && place) return `${client.segment} em ${place}`;
  if (client.segment) return client.segment;
  if (place) return `Cliente em ${place}`;
  return undefined;
}

/** Vigência do contrato, para renovação e corte do serviço. */
function contractBadge(client: Client): { label: string; tone: "ok" | "warn" | "danger" } | null {
  if (!client.contract_end) return client.contract_start ? { label: `Cliente desde ${formatDate(client.contract_start)}`, tone: "ok" } : null;
  const days = Math.round((Date.parse(client.contract_end) - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Contrato vencido em ${formatDate(client.contract_end)}`, tone: "danger" };
  if (days <= 30) return { label: `Contrato vence em ${days} dia(s)`, tone: "warn" };
  return { label: `Contrato até ${formatDate(client.contract_end)}`, tone: "ok" };
}

export default async function ClientPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const sites = await listClientSites(client.id);
  const publications = await listClientPublications(
    sites.map((s) => s.id),
    10,
  );
  const status = CLIENT_STATUS[client.status];
  const contract = contractBadge(client);

  return (
    <>
      <PageHeader
        back={<BackLink href="/clientes">Clientes e sites</BackLink>}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <BrandDot color={client.brand_color} className="size-3.5" />
            <span className="min-w-0 break-words">{client.name}</span>
          </span>
        }
        description={describe(client)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {contract ? <Badge tone={contract.tone}>{contract.label}</Badge> : null}
            <Badge tone={status.tone}>
              <StatusDot tone={status.tone} />
              {status.label}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Sites"
            description="Destinos onde os artigos deste cliente vão ao ar."
            actions={
              <Link href={`/clientes/${client.id}/sites/novo`} className={buttonClass("secondary")}>
                <Plus className="size-4" aria-hidden />
                Adicionar site
              </Link>
            }
            bodyClassName={sites.length > 0 ? "p-0" : undefined}
            className="overflow-hidden"
          >
            {sites.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum site ainda. Adicione o site do cliente para escolher ele como destino ao publicar um artigo.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {sites.map((site) => (
                  <li key={site.id}>
                    <Link
                      href={`/clientes/${client.id}/sites/${site.id}`}
                      className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-sunken"
                    >
                      <ConnectionDot ok={site.last_check_ok} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-ink">{site.name}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {hostname(site.url)}
                          {site.status === "paused" ? ", pausado" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12.5px] text-muted">{PLATFORM[site.platform].label}</span>
                      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Publicações recentes"
            description="Últimos artigos enviados aos sites deste cliente."
            bodyClassName={publications.length > 0 ? "p-0" : undefined}
            className="overflow-hidden"
          >
            {publications.length === 0 ? (
              <p className="text-sm text-muted">
                {sites.length === 0
                  ? "Os artigos publicados aparecem aqui depois que o cliente tiver um site."
                  : "Nenhum artigo publicado nos sites deste cliente ainda. Escolha um deles como destino ao publicar."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {publications.map((pub) => (
                  <li key={pub.id} className="px-5 py-3">
                    <Link
                      href={`/artigos/${pub.post_id}`}
                      className="block py-0.5 text-[14.5px] leading-snug font-medium text-ink underline-offset-3 hover:underline"
                    >
                      {pub.post?.title?.trim() || "Artigo sem título"}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                      <PublicationBadge status={pub.status} />
                      {pub.site ? <span className="truncate">{pub.site.name}</span> : null}
                      <span>{formatDate(pub.published_at ?? pub.updated_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <details className="group rounded-[var(--radius-panel)] border border-line bg-surface open:border-transparent open:bg-transparent">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 group-open:mb-4 group-open:px-0">
              <span>
                <span className="block text-[15px] font-semibold text-ink">Dados do cliente (opcional)</span>
                <span className="block text-sm text-muted">
                  Contato, serviços, tom de voz e especialista. Não são necessários para publicar; só deixam os textos da IA mais certeiros.
                </span>
              </span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ClientForm key={client.updated_at} client={client} />
          </details>
          <DeleteClientPanel clientId={client.id} clientName={client.name} siteCount={sites.length} />
        </div>
      </div>
    </>
  );
}
