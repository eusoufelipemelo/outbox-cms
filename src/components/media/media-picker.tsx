"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { updateMediaAlt } from "@/lib/data/media-actions";
import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MEDIA_ALT_MAX } from "./constants";
import { UploadBox, UploadQueue } from "./dropzone";
import { fetchMediaPage, mergeMedia } from "./client-api";
import { Thumb } from "./thumb";
import { useUploader } from "./upload";

type Tab = "biblioteca" | "enviar";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function fileLabel(media: Media) {
  const name = media.path.split("/").pop() ?? "";
  return name.replace(/^[0-9a-f-]{36}-/i, "");
}

/**
 * Seletor de imagem da biblioteca, com envio. Contrato em CLAUDE.md:
 * <MediaPicker open onClose onSelect={({ url, alt }) => ...} clientId? />
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (m: { url: string; alt: string | null }) => void;
  clientId?: string;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(<PickerDialog onClose={onClose} onSelect={onSelect} clientId={clientId} />, document.body);
}

type Result = { key: string; items: Media[]; hasMore: boolean; page: number; error?: string };

function PickerDialog({
  onClose,
  onSelect,
  clientId,
}: {
  onClose: () => void;
  onSelect: (m: { url: string; alt: string | null }) => void;
  clientId?: string;
}) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ biblioteca: null, enviar: null });

  const [tab, setTab] = useState<Tab>("biblioteca");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [onlyClient, setOnlyClient] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Media | null>(null);
  const [alt, setAlt] = useState("");
  const [altError, setAltError] = useState<string | null>(null);

  const filterClient = onlyClient && clientId ? clientId : null;
  const key = `${term}|${filterClient ?? ""}`;
  const loading = result?.key !== key;

  // Foco inicial, trava de rolagem e devolução de foco ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  // Busca com atraso curto.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetchMediaPage({ q: term, clientId: filterClient, page: 0 })
      .then((p) => {
        if (!cancelled) setResult({ key, items: p.data, hasMore: p.hasMore, page: 0 });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setResult({ key, items: [], hasMore: false, page: 0, error: e instanceof Error ? e.message : "Não foi possível carregar a biblioteca." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, term, filterClient]);

  const choose = useCallback((m: Media) => {
    setSelected(m);
    setAlt(m.alt ?? "");
    setAltError(null);
  }, []);

  const uploader = useUploader({
    clientId: clientId ?? null,
    onUploaded: (m) => setResult((r) => (r ? { ...r, items: [m, ...r.items.filter((i) => i.id !== m.id)] } : r)),
  });

  async function handleFiles(files: File[]) {
    const uploaded = await uploader.addFiles(files);
    if (uploaded.length) {
      choose(uploaded[0]);
      setTab("biblioteca");
      setTimeout(() => altRef.current?.focus(), 0);
    }
  }

  async function loadMore() {
    if (!result) return;
    setLoadingMore(true);
    try {
      const next = await fetchMediaPage({ q: term, clientId: filterClient, page: result.page + 1 });
      setResult((r) => (r ? { ...r, items: mergeMedia(r.items, next.data), hasMore: next.hasMore, page: r.page + 1 } : r));
    } catch (e) {
      setResult((r) => (r ? { ...r, error: e instanceof Error ? e.message : "Não foi possível carregar mais imagens." } : r));
    } finally {
      setLoadingMore(false);
    }
  }

  function insert() {
    if (!selected) return;
    const value = alt.replace(/\s+/g, " ").trim();
    if (!value) {
      setAltError("Escreva o texto alternativo antes de inserir a imagem.");
      altRef.current?.focus();
      return;
    }
    // Imagem sem descrição na biblioteca: aproveita a que foi escrita agora.
    if (!selected.alt) void updateMediaAlt(selected.id, value).catch(() => undefined);
    onSelect({ url: selected.url, alt: value });
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onTabKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = tab === "biblioteca" ? "enviar" : "biblioteca";
    const target = e.key === "Home" ? "biblioteca" : e.key === "End" ? "enviar" : next;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  const titleId = `${uid}-titulo`;
  const altId = `${uid}-alt`;
  const items = result?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Fechar seletor de imagem" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/35" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-panel)] bg-surface shadow-[var(--shadow-pop)]",
          "sm:h-[min(780px,90dvh)] sm:max-w-3xl sm:rounded-[var(--radius-panel)]",
          "transition duration-150 ease-out starting:translate-y-2 starting:opacity-0",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold text-ink">
              Inserir imagem
            </h2>
            <div role="tablist" aria-label="Origem da imagem" className="mt-3 flex gap-1">
              {(
                [
                  ["biblioteca", "Biblioteca"],
                  ["enviar", "Enviar"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`${uid}-painel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={onTabKey}
                  className={cn(
                    "relative h-10 cursor-pointer px-3 text-[14px] transition-colors",
                    tab === id ? "font-semibold text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                  {tab === id ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-[3px] rounded-t bg-brand" /> : null}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center self-start rounded-lg text-muted hover:bg-sunken hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div
          role="tabpanel"
          id={`${uid}-painel-biblioteca`}
          aria-labelledby={`${uid}-tab-biblioteca`}
          hidden={tab !== "biblioteca"}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={`${uid}-busca`} className="sr-only">
                Buscar imagens
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input
                ref={searchRef}
                id={`${uid}-busca`}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por descrição ou nome do arquivo"
                className="pl-9"
              />
            </div>
            {clientId ? (
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={onlyClient} onChange={(e) => setOnlyClient(e.target.checked)} className="size-4 accent-ink" />
                Só deste cliente
              </label>
            ) : null}
          </div>

          {result?.error ? (
            <p role="alert" className="mb-3 text-sm text-danger">
              {result.error}
            </p>
          ) : null}

          {loading && !items.length ? (
            <ul aria-hidden className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <li key={i} className="aspect-square rounded-[var(--radius-control)] bg-sunken" />
              ))}
            </ul>
          ) : items.length ? (
            <>
              <ul className={cn("grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5", loading && "opacity-60")} aria-busy={loading || undefined}>
                {items.map((m) => {
                  const active = selected?.id === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={m.alt ? m.alt : `Imagem sem descrição: ${fileLabel(m)}`}
                        onClick={() => choose(m)}
                        onDoubleClick={() => {
                          choose(m);
                          setTimeout(() => altRef.current?.focus(), 0);
                        }}
                        className={cn(
                          "block w-full cursor-pointer rounded-[var(--radius-control)] border p-0 transition-colors",
                          active ? "notch border-ink ring-1 ring-ink" : "border-line hover:border-line-strong",
                        )}
                      >
                        <Thumb url={m.url} alt="" sizes="(min-width: 768px) 140px, 30vw" className="rounded-[calc(var(--radius-control)-1px)]" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {result?.hasMore ? (
                <div className="mt-4">
                  <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                    Carregar mais
                  </Button>
                </div>
              ) : null}
            </>
          ) : !loading ? (
            <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8">
              <p className="text-[16px] font-semibold text-ink">{term || filterClient ? "Nenhuma imagem encontrada" : "A biblioteca está vazia"}</p>
              <p className="text-sm text-muted">
                {term || filterClient ? "Tente outro termo ou envie uma imagem nova." : "Envie a primeira imagem para usar neste artigo."}
              </p>
              <Button variant="secondary" onClick={() => setTab("enviar")}>
                Enviar imagem
              </Button>
            </div>
          ) : null}
        </div>

        <div
          role="tabpanel"
          id={`${uid}-painel-enviar`}
          aria-labelledby={`${uid}-tab-enviar`}
          hidden={tab !== "enviar"}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
        >
          <UploadBox onFiles={(files) => void handleFiles(files)} compact />
          <UploadQueue items={uploader.items} onDismiss={uploader.dismiss} />
          <p className="text-[13px] text-muted">Depois do envio, a imagem fica selecionada para você escrever o texto alternativo.</p>
        </div>

        <footer className="border-t border-line bg-surface px-5 py-4">
          {selected ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Thumb url={selected.url} alt="" sizes="72px" className="hidden size-[72px] shrink-0 rounded-[var(--radius-control)] sm:block" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor={altId} className="block text-sm font-medium text-ink">
                  Texto alternativo
                </label>
                <Input
                  ref={altRef}
                  id={altId}
                  value={alt}
                  maxLength={MEDIA_ALT_MAX}
                  required
                  aria-invalid={altError ? true : undefined}
                  aria-describedby={`${altId}-ajuda`}
                  placeholder="Ex.: Cozinha planejada em MDF branco com bancada de granito"
                  onChange={(e) => {
                    setAlt(e.target.value);
                    if (altError) setAltError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      insert();
                    }
                  }}
                />
                {altError ? (
                  <p id={`${altId}-ajuda`} role="alert" className="text-[13px] text-danger">
                    {altError}
                  </p>
                ) : (
                  <p id={`${altId}-ajuda`} className="text-[13px] text-muted">
                    Descreva o que aparece na imagem. O Google usa esse texto para entender a página, e leitores de tela o leem para quem não
                    vê a imagem.
                  </p>
                )}
              </div>
              <div className="flex gap-2 sm:pt-[26px]">
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={insert}>Inserir imagem</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Escolha uma imagem da biblioteca ou envie uma nova.</p>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
