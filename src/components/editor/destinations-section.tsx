"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Braces, Check, ExternalLink, Newspaper, Search, TriangleAlert, Webhook } from "lucide-react";
import { Badge, PublicationBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import type { SitePlatform } from "@/lib/types";
import { cn, hostname } from "@/lib/utils";
import { ClientDot, Tip } from "./primitives";
import type { DestinationDraft, DestinationSite, Publication } from "./types";

const platform: Record<SitePlatform, { label: string; Icon: typeof Braces }> = {
  api: { label: "Content API", Icon: Braces },
  wordpress: { label: "WordPress", Icon: Newspaper },
  webhook: { label: "Webhook", Icon: Webhook },
};

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
      d.overrideSeoDescription.trim(),
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

export function DestinationsSection({
  sites,
  destinations,
  publications,
  busySiteId,
  onToggle,
  onCanonical,
  onUnpublish,
}: {
  sites: DestinationSite[];
  destinations: DestinationDraft[];
  publications: Publication[];
  busySiteId: string | null;
  onToggle: (siteId: string) => void;
  onCanonical: (siteId: string) => void;
  onUnpublish: (siteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Map(destinations.map((d) => [d.siteId, d])), [destinations]);
  const pubs = useMemo(() => new Map(publications.map((p) => [p.siteId, p])), [publications]);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const map = new Map<string, { client: DestinationSite["client"]; sites: DestinationSite[] }>();
    for (const site of sites) {
      if (q && !normalize(`${site.name} ${site.url} ${site.client.name}`).includes(q)) continue;
      const g = map.get(site.client.id) ?? { client: site.client, sites: [] };
      g.sites.push(site);
      map.set(site.client.id, g);
    }
    return [...map.values()];
  }, [sites, query]);

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

  return (
    <div className="space-y-4">
      {sites.length > 5 ? (
        <div className="relative">
          <label htmlFor="dest-search" className="sr-only">
            Buscar site ou cliente
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="dest-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar site ou cliente"
            className="pl-9"
          />
        </div>
      ) : null}

      {multi ? (
        <p className="text-[13px] leading-snug text-muted">
          Marque um site como original: os outros apontam para ele (link canônico) e o Google não penaliza o conteúdo repetido.
        </p>
      ) : null}
      <DuplicateNotice destinations={destinations} />

      {groups.length === 0 ? <p className="text-sm text-muted">Nenhum site encontrado para “{query}”.</p> : null}

      {groups.map(({ client, sites: groupSites }) => (
        <div key={client.id} role="group" aria-labelledby={`client-${client.id}`}>
          <p id={`client-${client.id}`} className="mb-2 flex items-baseline gap-2 text-[13px]">
            <span className="font-semibold text-ink">{client.name}</span>
            {client.city ? (
              <span className="text-muted">
                {client.city}
                {client.state ? `, ${client.state}` : ""}
              </span>
            ) : null}
          </p>
          <ul className="space-y-2">
            {groupSites.map((site) => {
              const dest = selected.get(site.id);
              const isSelected = Boolean(dest);
              const pub = pubs.get(site.id);
              const live = pub?.status === "published";
              const paused = site.status === "paused";
              const P = platform[site.platform];
              const busy = busySiteId === site.id;
              return (
                <li
                  key={site.id}
                  className={cn(
                    "rounded-[var(--radius-control)] border bg-surface transition-colors duration-150",
                    isSelected ? "notch border-ink" : "border-line hover:border-line-strong",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    disabled={(paused && !isSelected) || busy}
                    onClick={() => onToggle(site.id)}
                    className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-[5px] border",
                        isSelected ? "border-ink bg-ink text-white" : "border-line-strong bg-surface",
                      )}
                    >
                      {isSelected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <ClientDot color={site.client.brand_color} />
                        <span className="truncate text-sm font-medium text-ink">{site.name}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">{hostname(site.url)}</span>
                    </span>
                    {paused ? <Badge>Pausado</Badge> : null}
                    <Tip label={P.label}>
                      <P.Icon className="size-4 shrink-0 text-faint" aria-hidden />
                      <span className="sr-only">{P.label}</span>
                    </Tip>
                  </button>

                  {isSelected || pub ? (
                    <div className="space-y-2 border-t border-line px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {pub ? <PublicationBadge status={pub.status} /> : <Badge>Ainda não enviado</Badge>}
                        {dest?.isCanonical ? <Badge tone="info">Original</Badge> : null}
                        {live && pub?.externalUrl ? (
                          <a
                            href={pub.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1 text-[13px] font-medium text-ink underline-offset-4 hover:underline"
                          >
                            Ver no site
                            <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                      {pub?.status === "failed" && pub.lastError ? (
                        <p className="text-[12.5px] leading-snug text-danger">{pub.lastError}</p>
                      ) : null}
                      {(isSelected && multi) || live ? (
                        <div className="-mx-2 flex flex-wrap gap-1">
                          {isSelected && multi ? (
                            <button
                              type="button"
                              aria-pressed={Boolean(dest?.isCanonical)}
                              onClick={() => onCanonical(site.id)}
                              className="inline-flex h-10 cursor-pointer items-center rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-sunken hover:text-ink"
                            >
                              {dest?.isCanonical ? "Desmarcar original" : "Marcar como original"}
                            </button>
                          ) : null}
                          {live ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onUnpublish(site.id)}
                              className="inline-flex h-10 cursor-pointer items-center rounded-lg px-2 text-[13px] font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                            >
                              {busy ? "Despublicando…" : "Despublicar"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
