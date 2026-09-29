import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listClients, type ClientListItem } from "@/lib/data/clients";
import { buttonClass } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/badge";
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

const COLS = "md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_7.5rem_6rem]";
const PAGE = 10;

type Svc = "completo" | "blog" | "instagram" | "nenhum";
const SVC: { key: Svc | ""; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "completo", label: "Pacote completo" },
  { key: "blog", label: "Blog + Google" },
  { key: "instagram", label: "Só Instagram" },
  { key: "nenhum", label: "Sem serviço" },
];

type Row = ClientListItem & { svc_blog_gbp?: boolean; svc_instagram?: boolean };

function svcOf(c: Row): Svc {
  if (c.svc_blog_gbp && c.svc_instagram) return "completo";
  if (c.svc_blog_gbp) return "blog";
  if (c.svc_instagram) return "instagram";
  return "nenhum";
}

type Params = { q: string; status: string; svc: string; uf: string };

function href(sp: Params, patch: Partial<Params> & { page?: number } = {}) {
  const next = { ...sp, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.status) p.set("status", next.status);
  if (next.svc) p.set("servico", next.svc);
  if (next.uf) p.set("uf", next.uf);
  if (patch.page && patch.page > 1) p.set("pagina", String(patch.page));
  const qs = p.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

/** Números das páginas com reticências: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const rawStatus = first(sp.status);
  const status = (CLIENT_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as ClientStatus) : "";
  const rawSvc = first(sp.servico);
  const svc = SVC.some((o) => o.key === rawSvc) ? (rawSvc as Svc | "") : "";
  const uf = first(sp.uf).toUpperCase().slice(0, 2);
  const params: Params = { q, status, svc, uf };
  const filtered = Boolean(q || status || svc || uf);

  const base = (await listClients({ q, status: status || undefined })) as Row[];
  const ufOf = (c: Row) => (c.state ?? "").toUpperCase();
  const bySvc = svc ? base.filter((c) => svcOf(c) === svc) : base;
  const byUf = uf ? base.filter((c) => ufOf(c) === uf) : base;
  const clients = uf ? bySvc.filter((c) => ufOf(c) === uf) : bySvc;

  const svcCount = (k: Svc | "") => (k ? byUf.filter((c) => svcOf(c) === k).length : byUf.length);
  const ufCounts = new Map<string, number>();
  for (const c of bySvc) {
    const key = ufOf(c) || "—";
    ufCounts.set(key, (ufCounts.get(key) ?? 0) + 1);
  }
  const ufs = [...ufCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

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

  if (base.length === 0 && !filtered) {
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[clamp(1.75rem,3vw,2.375rem)]">Clientes e sites</h1>
          <p className="mt-1 text-[14px] text-muted">
            {filtered
              ? `${plural(clients.length, "cliente encontrado", "clientes encontrados")}, com ${plural(siteTotal, "site", "sites")}.`
              : `${plural(clients.length, "cliente", "clientes")} e ${plural(siteTotal, "site de destino", "sites de destino")}.`}
          </p>
        </div>
        {newButton}
      </div>

      <div className="mb-3">
        <ClientFilters q={q} status={status} />
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrar por serviço" className="flex flex-wrap gap-1.5">
          {SVC.map((o) => {
            const n = svcCount(o.key);
            const on = svc === o.key;
            return (
              <Link
                key={o.key || "todos"}
                href={href(params, { svc: o.key })}
                scroll={false}
                aria-current={on ? "true" : undefined}
                className={chip(on)}
              >
                {o.key ? <SvcMark svc={o.key} /> : null}
                {o.label}
                <span className={on ? "tabular-nums opacity-80" : "tabular-nums text-faint"}>{n}</span>
              </Link>
            );
          })}
        </nav>
        {ufs.length > 1 || uf ? (
          <nav aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[12.5px] text-muted">Estado</span>
            {uf ? (
              <Link href={href(params, { uf: "" })} scroll={false} className={chip(false)}>
                Todos
              </Link>
            ) : null}
            {ufs.map(([k, n]) =>
              k === "—" ? null : (
                <Link
                  key={k}
                  href={href(params, { uf: uf === k ? "" : k })}
                  scroll={false}
                  aria-current={uf === k ? "true" : undefined}
                  className={chip(uf === k)}
                >
                  {k}
                  <span className={uf === k ? "tabular-nums opacity-80" : "tabular-nums text-faint"}>{n}</span>
                </Link>
              ),
            )}
          </nav>
        ) : null}
      </div>

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={
            q
              ? `Nada corresponde a "${q}" com esses filtros. Confira a grafia ou limpe os filtros.`
              : "Nenhum cliente combina com esses filtros."
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
            className={`hidden border-b border-line bg-sunken/60 px-4 py-2 text-[12.5px] font-medium text-muted md:grid md:gap-5 ${COLS}`}
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

      {clients.length > 0 ? (
        <nav aria-label="Páginas" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className="text-muted tabular-nums">
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, clients.length)} de {clients.length}
          </span>
          {pages > 1 ? (
            <span className="flex items-center gap-1">
              <PageLink to={page > 1 ? href(params, { page: page - 1 }) : null} label="Página anterior">
                <ChevronLeft className="size-4" aria-hidden />
              </PageLink>
              {pageList(page, pages).map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 text-faint">
                    …
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={href(params, { page: n })}
                    scroll={false}
                    aria-current={n === page ? "page" : undefined}
                    className={`grid h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-2 tabular-nums transition-colors ${
                      n === page ? "bg-ink font-semibold text-on-ink" : "text-text hover:bg-sunken"
                    }`}
                  >
                    {n}
                  </Link>
                ),
              )}
              <PageLink to={page < pages ? href(params, { page: page + 1 }) : null} label="Próxima página">
                <ChevronRight className="size-4" aria-hidden />
              </PageLink>
            </span>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

function chip(on: boolean) {
  return `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
    on ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text hover:border-line-hover"
  }`;
}

function PageLink({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  const cls = "grid size-8 place-items-center rounded-[var(--radius-control)] border border-line";
  if (!to)
    return (
      <span aria-hidden className={`${cls} text-faint opacity-50`}>
        {children}
      </span>
    );
  return (
    <Link href={to} scroll={false} aria-label={label} className={`${cls} text-text hover:bg-sunken`}>
      {children}
    </Link>
  );
}

/** Marca de cor dos canais contratados: laranja = Blog + Google, roxo = Instagram. */
function SvcMark({ svc }: { svc: Svc }) {
  if (svc === "nenhum") return <span aria-hidden className="size-2 rounded-full border border-faint" />;
  return (
    <span aria-hidden className="flex -space-x-0.5">
      {svc !== "instagram" ? <span className="size-2 rounded-full bg-ch-blog" /> : null}
      {svc !== "blog" ? <span className="size-2 rounded-full bg-ch-instagram" /> : null}
    </span>
  );
}

function ClientRow({ client }: { client: Row }) {
  const s = CLIENT_STATUS[client.status];
  const location = place(client);
  const site = client.sites[0];
  const extra = client.sites.length - 1;
  const svc = svcOf(client);

  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2.5 transition-colors duration-150 hover:bg-sunken md:rounded-none md:border-0 md:py-2 ${COLS}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandDot color={client.brand_color} />
        <p className="flex min-w-0 items-baseline gap-2">
          <Link
            href={`/clientes/${client.id}`}
            className="shrink-0 truncate text-[14px] font-semibold text-ink after:absolute after:inset-0 after:content-[''] max-w-[70%]"
          >
            {client.name}
          </Link>
          <span className="truncate text-[12.5px] text-muted">{client.segment || "Segmento não informado"}</span>
        </p>
      </div>
      <p className="truncate text-[13px] text-text max-md:hidden">{location ?? <span className="text-muted">Não informada</span>}</p>
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] max-md:hidden">
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
      <p className="flex items-center gap-1.5 text-[12.5px] max-md:hidden">
        <SvcMark svc={svc} />
        <span className={svc === "nenhum" ? "text-faint" : "text-text"}>{SVC.find((o) => o.key === svc)?.label}</span>
      </p>
      <p className="flex items-center justify-end gap-1.5 text-[12.5px] text-muted">
        <StatusDot tone={s.tone} />
        {s.label}
      </p>
    </li>
  );
}
