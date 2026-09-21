"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Braces, Check, ExternalLink, Newspaper, Search, TriangleAlert, Webhook, X } from "lucide-react";
import { Badge, PublicationBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import type { SitePlatform } from "@/lib/types";
import { cn, hostname } from "@/lib/utils";
import { ClientDot, Tip } from "./primitives";
import type { DestinationDraft, DestinationSite, Publication } from "./types";

// Escolha de destinos pensada para muitos clientes: o que está escolhido fica sempre no topo,
// a busca filtra a lista inteira e só um punhado de linhas é desenhado por vez.

const PAGE = 25;

const platform: Record<SitePlatform, { label: string; Icon: typeof Braces }> = {
  api: { label: "Content API", Icon: Braces },
  wordpress: { label: "WordPress", Icon: Newspaper },
  webhook: { label: "Webhook", Icon: Webhook },
};

type Filter = "todos" | "no-ar" | "novos";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "no-ar", label: "Já no ar" },
  { id: "novos", label: "Ainda não" },
];

function normalize(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function hasVariation(d: DestinationDraft) {
  return Boolean(
    d.overrideTitle.trim() ||
      d.overrideExcerpt.trim() ||
      d.overrideContentHtml.trim() ||
      d.overrideSeoTitle.trim() ||
      d.overrideSeoDescription.trim() ||
      d.overrideAnswerSummary.trim() ||
      d.overrideFaq.length,
  );
}

export function DuplicateNotice({ destinations }: { destinations: DestinationDraft[] }) {
  if (destinations.length < 2) return null;
  if (destinations.some((d) => d.isCanonical) || destinations.some(hasVariation)) return null;
  return (
    <p className="flex gap-2 rounded-[var(--radius-control)] bg-warn-soft px-3 py-2.5 text-[13px] leading-snug text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        O mesmo texto vai para {destinations.length} sites. Marque um site como original ou crie variações para evitar conteúdo
        duplicado no Google.
      </span>
    </p>
  );
}

/** Uma linha da lista: cliente, endereço e estado. Toda a linha liga e desliga o destino. */
function SiteRow({
  site,
  selected,
  pub,
  busy,
  onToggle,
  onRemove,
}: {
  site: DestinationSite;
  selected: boolean;
  pub?: Publication;
  busy: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const paused = site.status === "paused";
  const P = platform[site.platform];
  const sameName = normalize(site.name) === normalize(site.client.name);
  const unpublished = pub?.status === "unpublished";
  return (
    <li className="relative">
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        disabled={(paused && !selected) || busy}
        onClick={onToggle}
        className={cn(
          "flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition-colors duration-150",
          selected ? "bg-sunken" : "hover:bg-sunken",
          "disabled:cursor-not-allowed disabled:opacity-55",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border",
            selected ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface",
          )}
        >
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <ClientDot color={site.client.brand_color} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-medium text-ink">{site.client.name}</span>
          <span className="block truncate text-[12px] text-muted">
            {sameName ? hostname(site.url) : `${site.name}, ${hostname(site.url)}`}
          </span>
        </span>
        {paused ? <Badge>Pausado</Badge> : pub?.status === "published" ? <Badge tone="ok">No ar</Badge> : null}
        {pub?.status === "failed" ? <Badge tone="danger">Falhou</Badge> : null}
        {unpublished ? <Badge tone="warn">Despublicado</Badge> : null}
        <Tip label={P.label}>
          <P.Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
          <span className="sr-only">{P.label}</span>
        </Tip>
      </button>
      {unpublished && onRemove ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Tirar ${site.client.name} do histórico deste artigo`}
          className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-ink disabled:opacity-60"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

export function DestinationsSection({
  sites,
  destinations,
  publications,
  busySiteId,
  onToggle,
  onCanonical,
  onUnpublish,
  onRemove,
}: {
  sites: DestinationSite[];
  destinations: DestinationDraft[];
  publications: Publication[];
  busySiteId: string | null;
  onToggle: (siteId: string) => void;
  onCanonical: (siteId: string) => void;
  onUnpublish: (siteId: string) => void;
  onRemove: (siteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [limit, setLimit] = useState(PAGE);
  const [showAllChosen, setShowAllChosen] = useState(false);

  const selected = useMemo(() => new Map(destinations.map((d) => [d.siteId, d])), [destinations]);
  const pubs = useMemo(() => new Map(publications.map((p) => [p.siteId, p])), [publications]);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  /** Sites que não estão escolhidos, já filtrados pela busca e pelo filtro de estado. */
  const results = useMemo(() => {
    const q = normalize(query.trim());
    return sites
      .filter((s) => !selected.has(s.id))
      .filter((s) => (q ? normalize(`${s.client.name} ${s.name} ${s.url} ${s.client.city ?? ""}`).includes(q) : true))
      .filter((s) => {
        if (filter === "no-ar") return pubs.get(s.id)?.status === "published";
        if (filter === "novos") return !pubs.get(s.id);
        return true;
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR"));
  }, [sites, selected, pubs, query, filter]);

  // linhas escolhidas, na ordem em que foram marcadas
  const chosen = useMemo(
    () => destinations.map((d) => ({ dest: d, site: byId.get(d.siteId) })).filter((x): x is { dest: DestinationDraft; site: DestinationSite } => Boolean(x.site)),
    [destinations, byId],
  );

  if (sites.length === 0) {
    return (
      <div className="space-y-3 text-sm text-muted">
        <p>Nenhum site cadastrado ainda. Cadastre o site de um cliente para poder publicar.</p>
        <Link href="/clientes" className="font-medium text-ink underline underline-offset-4">
          Ir para Clientes e sites
        </Link>
      </div>
    );
  }

  const multi = destinations.length >= 2;
  const visible = results.slice(0, limit);
  const rest = results.length - visible.length;
  const canSelectAll = query.trim().length > 0 && results.length > 1 && results.length <= 50;

  return (
    <div className="space-y-4">
      {/* Escolhidos: o que importa fica no topo, com estado e ações */}
      {chosen.length ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink">
              {chosen.length === 1 ? "1 site escolhido" : `${chosen.length} sites escolhidos`}
            </p>
            <button
              type="button"
              onClick={() => chosen.forEach(({ dest }) => onToggle(dest.siteId))}
              className="cursor-pointer text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Limpar
            </button>
          </div>
          <ul className="space-y-2">
            {(showAllChosen ? chosen : chosen.slice(0, 6)).map(({ dest, site }) => {
              const pub = pubs.get(site.id);
              const live = pub?.status === "published";
              const busy = busySiteId === site.id;
              return (
                <li key={site.id} className="notch rounded-[var(--radius-control)] border border-ink bg-surface">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <ClientDot color={site.client.brand_color} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{site.client.name}</span>
                      <span className="block truncate text-[12px] text-muted">{hostname(site.url)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggle(site.id)}
                      disabled={busy}
                      aria-label={`Tirar ${site.client.name} dos destinos`}
                      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-60"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-2">
                    {pub ? <PublicationBadge status={pub.status} /> : <Badge>Aguardando</Badge>}
                    {dest.isCanonical ? <Badge tone="info">Original</Badge> : null}
                    {live && pub?.externalUrl ? (
                      <a
                        href={pub.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 text-[12.5px] font-medium text-ink underline-offset-4 hover:underline"
                      >
                        Ver no site
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                    {multi ? (
                      <button
                        type="button"
                        aria-pressed={Boolean(dest.isCanonical)}
                        onClick={() => onCanonical(site.id)}
                        className="ml-auto inline-flex h-8 cursor-pointer items-center rounded-lg px-1.5 text-[12.5px] font-medium text-muted hover:bg-sunken hover:text-ink"
                      >
                        {dest.isCanonical ? "Desmarcar original" : "Marcar original"}
                      </button>
                    ) : null}
                    {live ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onUnpublish(site.id)}
                        className="inline-flex h-8 cursor-pointer items-center rounded-lg px-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                      >
                        {busy ? "Despublicando…" : "Despublicar"}
                      </button>
                    ) : null}
                  </div>
                  {pub?.status === "failed" && pub.lastError ? (
                    <p className="border-t border-line px-3 py-2 text-[12.5px] leading-snug text-danger">{pub.lastError}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {chosen.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAllChosen((v) => !v)}
              className="mt-2 h-9 w-full cursor-pointer rounded-[var(--radius-control)] border border-line text-[13px] font-medium text-muted hover:border-line-strong hover:text-ink"
            >
              {showAllChosen ? "Mostrar menos" : `Ver os outros ${chosen.length - 6} escolhidos`}
            </button>
          ) : null}
        </div>
      ) : null}

      {multi ? (
        <p className="text-[13px] leading-snug text-muted">
          Marque um site como original: os outros apontam para ele (link canônico) e o Google não penaliza o conteúdo repetido.
        </p>
      ) : null}
      <DuplicateNotice destinations={destinations} />

      {/* Busca e filtros da lista */}
      <div className="space-y-2 border-t border-line pt-4">
        <div className="relative">
          <label htmlFor="dest-search" className="sr-only">
            Buscar cliente, site ou cidade
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="dest-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar cliente, site ou cidade"
            className="h-10 pl-9"
          />
        </div>
        {sites.length > 8 ? (
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  setLimit(PAGE);
                }}
                className={cn(
                  "h-8 cursor-pointer rounded-[var(--radius-chip)] border px-2.5 text-[12.5px] transition-colors duration-150",
                  filter === f.id ? "border-ink bg-ink font-medium text-on-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Lista compacta */}
      {results.length === 0 ? (
        <p className="text-[13px] text-muted">
          {query.trim()
            ? `Nenhum site encontrado para “${query.trim()}”.`
            : chosen.length
              ? "Todos os sites desta lista já estão escolhidos."
              : "Nenhum site neste filtro."}
        </p>
      ) : (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-[12.5px] text-muted">
              {results.length === 1 ? "1 site disponível" : `${results.length} sites disponíveis`}
            </p>
            {canSelectAll ? (
              <button
                type="button"
                onClick={() => results.forEach((s) => s.status !== "paused" && onToggle(s.id))}
                className="cursor-pointer text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Escolher os {results.length}
              </button>
            ) : null}
          </div>
          <ul className="-mx-1 max-h-[46vh] overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
            {visible.map((site) => (
              <SiteRow
                key={site.id}
                site={site}
                selected={false}
                pub={pubs.get(site.id)}
                busy={busySiteId === site.id}
                onToggle={() => onToggle(site.id)}
                onRemove={() => onRemove(site.id)}
              />
            ))}
          </ul>
          {rest > 0 ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE * 2)}
              className="mt-2 h-9 w-full cursor-pointer rounded-[var(--radius-control)] border border-line text-[13px] font-medium text-muted hover:border-line-strong hover:text-ink"
            >
              Mostrar mais {Math.min(rest, PAGE * 2)} de {rest}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
