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

const COLS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_6.5rem]";
const PAGE = 25;

function pageHref(sp: { q: string; status: string }, page: number) {
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.status) p.set("status", sp.status);
  if (page > 1) p.set("pagina", String(page));
  const qs = p.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const rawStatus = first(sp.status);
  const status = (CLIENT_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as ClientStatus) : "";
  const filtered = Boolean(q || status);

  const clients = await listClients({ q, status: status || undefined });
  const siteTotal = clients.reduce((n, c) => n + c.sites.length, 0);
  const pages = Math.max(1, Math.ceil(clients.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(first(sp.pagina), 10) || 1));
  const shown = clients.slice((page - 1) * PAGE, page * PAGE);

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

      <div className="mb-5">
        <ClientFilters q={q} status={status} />
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
            <span>Site</span>
            <span>Serviços</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="space-y-2 md:space-y-0 md:divide-y md:divide-line">
            {shown.map((client) => (
              <ClientRow key={client.id} client={client} />
            ))}
          </ul>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted">
            {(page - 1) * PAGE + 1} a {Math.min(page * PAGE, clients.length)} de {clients.length}
          </span>
          <span className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={pageHref({ q, status }, page - 1)} className={buttonClass("secondary", "sm")}>
                Anterior
              </Link>
            ) : null}
            <span className="px-2 text-muted tabular-nums">
              {page}/{pages}
            </span>
            {page < pages ? (
              <Link href={pageHref({ q, status }, page + 1)} className={buttonClass("secondary", "sm")}>
                Próxima
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}

function ClientRow({ client }: { client: ClientListItem }) {
  const s = CLIENT_STATUS[client.status];
  const location = place(client);
  const site = client.sites[0];
  const extra = client.sites.length - 1;
  const c = client as ClientListItem & { svc_blog_gbp?: boolean; svc_instagram?: boolean };

  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 transition-colors duration-150 hover:bg-sunken md:rounded-none md:border-0 md:px-5 md:py-2.5 ${COLS}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandDot color={client.brand_color} />
        <div className="min-w-0">
          <Link href={`/clientes/${client.id}`} className="block truncate text-[14.5px] font-semibold text-ink after:absolute after:inset-0 after:content-['']">
            {client.name}
          </Link>
          <p className="truncate text-[12.5px] text-muted">{client.segment || "Segmento não informado"}</p>
        </div>
      </div>
      <p className="truncate text-[13.5px] text-text max-md:hidden">{location ?? <span className="text-muted">Não informada</span>}</p>
      <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] max-md:hidden">
        {site ? (
          <>
            <ConnectionDot ok={site.last_check_ok} />
            <span className={site.status === "paused" ? "truncate text-muted" : "truncate text-text"}>{hostname(site.url)}</span>
            {extra > 0 ? <span className="shrink-0 text-[12px] text-muted">+{extra}</span> : null}
          </>
        ) : (
          <span className="text-muted">Nenhum site</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 max-md:hidden">
        {c.svc_blog_gbp ? <Badge tone="info">Blog + Google</Badge> : null}
        {c.svc_instagram ? <Badge tone="brand">Instagram</Badge> : null}
        {!c.svc_blog_gbp && !c.svc_instagram ? <span className="text-[12.5px] text-faint">Nenhum</span> : null}
      </div>
      <div className="flex justify-end">
        <Badge tone={s.tone}>
          <StatusDot tone={s.tone} />
          {s.label}
        </Badge>
      </div>
    </li>
  );
}
