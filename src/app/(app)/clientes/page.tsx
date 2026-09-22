import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listClients, type ClientListItem } from "@/lib/data/clients";
import { buttonClass } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { BrandDot, ConnectionDot } from "@/components/clients/bits";
import { ClientFilters } from "@/components/clients/client-filters";
import { ClientViewTabs } from "@/components/clients/view-tabs";
import { CLIENT_STATUS, CLIENT_STATUSES } from "@/components/clients/options";
import type { ClientStatus } from "@/lib/types";
import { hostname } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes e sites" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function place(client: Pick<ClientListItem, "city" | "state">): string | null {
  if (client.city && client.state) return `${client.city}, ${client.state}`;
  return client.city || client.state || null;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const COLS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,2.3fr)_6.5rem]";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const rawStatus = first(sp.status);
  const status = (CLIENT_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as ClientStatus) : "";
  const filtered = Boolean(q || status);

  const clients = await listClients({ q, status: status || undefined });
  const siteTotal = clients.reduce((n, c) => n + c.sites.length, 0);

  const newButton = (
    <Link href="/clientes/novo" className={buttonClass("primary")}>
      <Plus className="size-4" aria-hidden />
      Novo cliente
    </Link>
  );

  if (clients.length === 0 && !filtered) {
    return (
      <>
        <PageHeader
          title="Clientes e sites"
          description="Cada cliente tem um ou mais sites, que são os destinos onde os artigos vão ao ar."
        />
        <EmptyState
          icon={<Users className="size-7" aria-hidden />}
          title="Cadastre o primeiro cliente"
          description="Registre o cliente, a voz da marca e o site dele. Depois é só escolher esse site como destino ao publicar um artigo."
          action={newButton}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Clientes e sites"
        description={
          filtered
            ? `${plural(clients.length, "cliente encontrado", "clientes encontrados")}, com ${plural(siteTotal, "site", "sites")}.`
            : `${plural(clients.length, "cliente", "clientes")} e ${plural(siteTotal, "site de destino", "sites de destino")}.`
        }
        actions={newButton}
      />

      <div className="mb-5 flex flex-wrap items-start gap-3">
        <ClientViewTabs current="lista" />
        <div className="min-w-0 flex-1">
          <ClientFilters q={q} status={status} />
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={
            q
              ? `Nada corresponde a "${q}"${status ? ` entre os ${CLIENT_STATUS[status].filter.toLowerCase()}` : ""}. Confira a grafia ou limpe os filtros.`
              : `Não há clientes ${CLIENT_STATUS[status as ClientStatus].filter.toLowerCase()} no momento.`
          }
          action={
            <Link href="/clientes" className={buttonClass("secondary")}>
              Limpar filtros
            </Link>
          }
        />
      ) : (
        <div className="md:overflow-hidden md:rounded-[var(--radius-panel)] md:border md:border-line md:bg-surface">
          <div
            className={`hidden border-b border-line px-5 py-2.5 text-[13px] font-medium text-muted md:grid md:gap-6 ${COLS}`}
            aria-hidden
          >
            <span>Cliente</span>
            <span>Cidade</span>
            <span>Sites</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="space-y-3 md:space-y-0 md:divide-y md:divide-line">
            {clients.map((client) => (
              <ClientRow key={client.id} client={client} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function ClientRow({ client }: { client: ClientListItem }) {
  const s = CLIENT_STATUS[client.status];
  const statusBadge = (
    <Badge tone={s.tone}>
      <StatusDot tone={s.tone} />
      {s.label}
    </Badge>
  );
  const location = place(client);

  return (
    <li
      className={`relative grid gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 transition-colors duration-150 hover:bg-sunken md:items-center md:gap-6 md:rounded-none md:border-0 md:px-5 md:py-4 ${COLS}`}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BrandDot color={client.brand_color} />
            <Link
              href={`/clientes/${client.id}`}
              className="truncate text-[15px] font-semibold text-ink after:absolute after:inset-0 after:content-['']"
            >
              {client.name}
            </Link>
          </div>
          <div className="md:hidden">{statusBadge}</div>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{client.segment || "Segmento não informado"}</p>
      </div>

      <p className="text-sm text-text">
        <span className="text-muted md:hidden">Cidade: </span>
        {location ?? <span className="text-muted">Não informada</span>}
      </p>

      <div className="min-w-0">
        {client.sites.length === 0 ? (
          <p className="text-sm text-muted">Nenhum site ainda</p>
        ) : (
          <>
            <p className="text-[13px] text-muted">{plural(client.sites.length, "site", "sites")}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {client.sites.map((site) => (
                <li key={site.id} className="flex min-w-0 items-center gap-1.5 text-sm text-text">
                  <ConnectionDot ok={site.last_check_ok} />
                  <span className={site.status === "paused" ? "truncate text-muted" : "truncate"}>{hostname(site.url)}</span>
                  {site.status === "paused" ? <span className="text-[12.5px] text-muted">(pausado)</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="hidden md:flex md:justify-end">{statusBadge}</div>
    </li>
  );
}
