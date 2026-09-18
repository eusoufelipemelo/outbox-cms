import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/data/clients";
import { getSite, listSiteDeliveries, toSiteFormValues } from "@/lib/data/sites";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { BackLink } from "@/components/clients/bits";
import { SiteForm } from "@/components/clients/site-form";
import { DeleteSitePanel, SiteConnectionPanel, SiteKeysPanel } from "@/components/clients/site-panels";
import { CHANNEL_LABEL, EVENT_LABEL, PLATFORM } from "@/components/clients/options";
import type { Delivery } from "@/lib/types";
import { formatDateTime, hostname } from "@/lib/utils";

type Props = { params: Promise<{ id: string; siteId: string }> };

const loadSite = cache(getSite);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteId } = await params;
  const site = await loadSite(siteId);
  return { title: site?.name ?? "Site" };
}

export default async function SitePage({ params }: Props) {
  await requireUser();
  const { id, siteId } = await params;
  const [client, site] = await Promise.all([getClient(id), loadSite(siteId)]);
  if (!client || !site || site.client_id !== client.id) notFound();

  const deliveries = await listSiteDeliveries(site.id, 20);
  // A senha do WordPress nunca vai para o navegador.
  const formValues = toSiteFormValues(site);

  return (
    <>
      <PageHeader
        back={<BackLink href={`/clientes/${client.id}`}>{client.name}</BackLink>}
        title={site.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-text underline-offset-3 hover:underline"
            >
              {hostname(site.url)}
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
            <span>{PLATFORM[site.platform].label}</span>
            {site.status === "paused" ? (
              <Badge tone="warn">
                <StatusDot tone="warn" />
                Pausado
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <Link href={`/integracoes?site=${site.id}`} className={buttonClass("secondary")}>
            <BookOpen className="size-4" aria-hidden />
            Ver como integrar
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-6 lg:order-2">
          <SiteConnectionPanel
            siteId={site.id}
            lastCheckAt={site.last_check_at}
            lastCheckOk={site.last_check_ok}
            lastCheckMessage={site.last_check_message}
          />
          <SiteKeysPanel siteId={site.id} publicKey={site.public_key} webhookSecret={site.webhook_secret} />
        </div>

        <div className="min-w-0 space-y-6 lg:order-1">
          <SiteForm key={site.updated_at} clientId={client.id} site={formValues} />
          <DeliveriesPanel deliveries={deliveries} />
          <DeleteSitePanel siteId={site.id} siteName={site.name} clientId={client.id} />
        </div>
      </div>
    </>
  );
}

function ResultBadge({ ok }: { ok: boolean }) {
  return (
    <Badge tone={ok ? "ok" : "danger"}>
      <StatusDot tone={ok ? "ok" : "danger"} />
      {ok ? "Sucesso" : "Falhou"}
    </Badge>
  );
}

function DeliveriesPanel({ deliveries }: { deliveries: Delivery[] }) {
  return (
    <Panel
      title="Entregas recentes"
      description="As últimas 20 tentativas de envio para este site."
      bodyClassName={deliveries.length > 0 ? "p-0" : undefined}
    >
      {deliveries.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma entrega registrada ainda. Cada publicação, atualização, remoção ou teste de conexão aparece aqui.
        </p>
      ) : (
        <>
          {/* telas largas: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Quando
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Canal
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Evento
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Resultado
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Mensagem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deliveries.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-text">{formatDateTime(d.created_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-text">{CHANNEL_LABEL[d.channel]}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-text">{EVENT_LABEL[d.event]}</td>
                    <td className="px-3 py-3">
                      <ResultBadge ok={d.ok} />
                    </td>
                    <td className="max-w-[280px] px-5 py-3 text-muted">
                      <span className="line-clamp-2 break-words" title={d.message ?? undefined}>
                        {d.message || (d.status_code ? `HTTP ${d.status_code}` : "Sem mensagem")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* celular: lista */}
          <ul className="divide-y divide-line md:hidden">
            {deliveries.map((d) => (
              <li key={d.id} className="space-y-1.5 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {EVENT_LABEL[d.event]} via {CHANNEL_LABEL[d.channel]}
                  </span>
                  <ResultBadge ok={d.ok} />
                </div>
                <p className="text-[13px] text-muted">{formatDateTime(d.created_at)}</p>
                {d.message ? <p className="text-[13px] break-words text-text">{d.message}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
