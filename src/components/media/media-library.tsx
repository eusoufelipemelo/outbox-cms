"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ImageUp, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ClientFilter } from "@/components/agenda/client-filter";
import { deleteMedia, updateMediaAlt } from "@/lib/data/media-actions";
import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MEDIA_ALT_MAX, formatBytes } from "./constants";
import { DropArea, HiddenFileInput, UploadBox, UploadQueue, type FilePickerHandle } from "./dropzone";
import { AiImagePanel } from "./ai-image";
import { Panel } from "@/components/ui/panel";
import { Sparkles } from "lucide-react";
import { Thumb } from "./thumb";
import { useUploader } from "./upload";
import { fetchMediaPage, mergeMedia, type MediaPageResult as Page } from "./client-api";

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  } catch {
    toast.error("Não foi possível copiar. Selecione e copie a URL manualmente.");
  }
}

function AltEditor({ media, onSaved }: { media: Media; onSaved: (alt: string | null) => void }) {
  const [value, setValue] = useState(media.alt ?? "");
  const [saving, start] = useTransition();
  const id = `alt-${media.id}`;

  function save() {
    const next = value.replace(/\s+/g, " ").trim();
    if (next === (media.alt ?? "")) return;
    start(async () => {
      const res = await updateMediaAlt(media.id, next);
      if (res.ok) {
        onSaved(res.data?.alt ?? null);
        toast.success(res.message ?? "Texto alternativo salvo");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Texto alternativo
      </label>
      <Input
        id={id}
        value={value}
        maxLength={MEDIA_ALT_MAX}
        placeholder="Descreva a imagem"
        aria-busy={saving || undefined}
        aria-describedby={!media.alt ? `${id}-hint` : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setValue(media.alt ?? "");
          }
        }}
        className={cn("h-9 px-2.5 text-[13.5px]", saving && "opacity-60")}
      />
      {!media.alt ? (
        <p id={`${id}-hint`} className="mt-1 text-[12.5px] text-warn">
          Sem texto alternativo
        </p>
      ) : null}
    </div>
  );
}

function MediaTile({
  media,
  clientName,
  onChange,
  onRemoved,
}: {
  media: Media;
  clientName: string | null;
  onChange: (m: Media) => void;
  onRemoved: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, start] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const meta = [media.width && media.height ? `${media.width} × ${media.height}` : null, formatBytes(media.size) || null]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="relative">
        <Thumb url={media.url} alt={media.alt ?? ""} sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 50vw" />
        {confirming ? (
          <div
            role="alertdialog"
            aria-labelledby={`del-${media.id}`}
            aria-describedby={`del-desc-${media.id}`}
            className="absolute inset-0 flex flex-col justify-end gap-2 bg-surface/95 p-3"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setConfirming(false);
                deleteRef.current?.focus();
              }
            }}
          >
            <p id={`del-${media.id}`} className="text-[14px] font-semibold text-ink">
              Excluir esta imagem?
            </p>
            <p id={`del-desc-${media.id}`} className="text-[12.5px] leading-snug text-muted">
              Artigos que já usam a imagem vão ficar sem ela.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="sm"
                className="h-10"
                loading={deleting}
                onClick={() =>
                  start(async () => {
                    const res = await deleteMedia(media.id);
                    if (res.ok) {
                      toast.success(res.message ?? "Imagem excluída");
                      onRemoved(media.id);
                    } else {
                      toast.error(res.error);
                    }
                  })
                }
              >
                Excluir imagem
              </Button>
              <Button
                ref={cancelRef}
                variant="ghost"
                size="sm"
                className="h-10"
                onClick={() => {
                  setConfirming(false);
                  deleteRef.current?.focus();
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-2 p-2.5">
        <AltEditor media={media} onSaved={(alt) => onChange({ ...media, alt })} />
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0 text-[12.5px] leading-snug text-muted">
            {meta ? <p className="truncate tabular-nums">{meta}</p> : null}
            {clientName ? <p className="truncate">{clientName}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => copyUrl(media.url)}
              aria-label="Copiar URL da imagem"
              title="Copiar URL"
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Copy className="size-4" aria-hidden />
            </button>
            <button
              ref={deleteRef}
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Excluir imagem"
              title="Excluir"
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function MediaLibrary({
  initial,
  clients,
  q,
  clientId,
}: {
  initial: Page;
  clients: { id: string; name: string }[];
  q: string;
  clientId: string | null;
}) {
  const router = useRouter();
  const filterKey = `${q}|${clientId ?? ""}`;
  const [shownKey, setShownKey] = useState(filterKey);
  const [items, setItems] = useState(initial.data);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(q);
  const [, startNav] = useTransition();
  const picker = useRef<FilePickerHandle>(null);
  const [generating, setGenerating] = useState(false);

  // Novo filtro vindo do servidor: recomeça a lista.
  if (shownKey !== filterKey) {
    setShownKey(filterKey);
    setItems(initial.data);
    setHasMore(initial.hasMore);
    setPage(0);
  }

  // Busca com atraso curto enquanto digita.
  useEffect(() => {
    const term = search.trim();
    if (term === q) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (term) qs.set("q", term);
      if (clientId) qs.set("cliente", clientId);
      const s = qs.toString();
      startNav(() => router.replace(s ? `/midia?${s}` : "/midia", { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, clientId, router]);

  const uploader = useUploader({
    clientId,
    onUploaded: (m) => setItems((prev) => [m, ...prev.filter((p) => p.id !== m.id)]),
  });

  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const filtering = Boolean(q || clientId);
  const currentClient = clientId ? clientNames.get(clientId) : null;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchMediaPage({ q, clientId, page: page + 1 });
      setItems((prev) => mergeMedia(prev, next.data));
      setHasMore(next.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar mais imagens.");
    } finally {
      setLoadingMore(false);
    }
  }

  const addFiles = (files: File[]) => void uploader.addFiles(files);

  if (!items.length && !filtering) {
    return (
      <div className="space-y-4">
        <UploadBox onFiles={addFiles} title="Envie a primeira imagem" />
        <UploadQueue items={uploader.items} onDismiss={uploader.dismiss} />
        <Panel title="Gerar com IA" description="Crie a imagem aqui mesmo, sem depender de banco de imagens.">
          <AiImagePanel clientId={clientId ?? undefined} onGenerated={(m) => setItems((prev) => [m, ...prev])} />
        </Panel>
      </div>
    );
  }

  return (
    <DropArea onFiles={addFiles} overlayLabel={currentClient ? `Solte para enviar para ${currentClient}` : "Solte para enviar à biblioteca"}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <label htmlFor="busca-midia" className="sr-only">
            Buscar imagens
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            id="busca-midia"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição ou nome do arquivo"
            className="pl-9"
          />
        </div>
        <ClientFilter
          basePath="/midia"
          params={{ q: q || undefined }}
          clients={clients}
          value={clientId ?? ""}
          className="w-full sm:w-auto"
        />
        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <Button variant="secondary" onClick={() => setGenerating((g) => !g)} aria-expanded={generating} className="w-full justify-center sm:w-auto">
            <Sparkles className="size-4" aria-hidden />
            Gerar com IA
          </Button>
          <Button onClick={() => picker.current?.open()} className="w-full justify-center sm:w-auto">
            <ImageUp className="size-4" aria-hidden />
            Enviar imagens
          </Button>
          <HiddenFileInput ref={picker} onFiles={addFiles} />
        </div>
      </div>

      <p className="-mt-2 mb-4 text-[13px] text-muted">
        Arraste imagens para esta área para enviar.{" "}
        {currentClient ? `Elas ficam associadas a ${currentClient}.` : "Filtre por cliente antes para associar as imagens a ele."}
      </p>

      {generating ? (
        <div className="mb-5">
          <Panel title="Gerar imagem com IA" description="A imagem entra na biblioteca e pode ser usada em qualquer artigo.">
            <AiImagePanel
              clientId={clientId ?? undefined}
              onGenerated={(m) => {
                setItems((prev) => [m, ...prev.filter((p) => p.id !== m.id)]);
                setGenerating(false);
                toast.success("Imagem gerada e salva na biblioteca.");
              }}
            />
          </Panel>
        </div>
      ) : null}

      <UploadQueue items={uploader.items} onDismiss={uploader.dismiss} className="mb-5" />

      {items.length ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((m) => (
              <MediaTile
                key={m.id}
                media={m}
                clientName={clientId ? null : m.client_id ? (clientNames.get(m.client_id) ?? null) : null}
                onChange={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                onRemoved={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
              />
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-6">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Carregar mais imagens
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-10">
          <p className="text-[17px] font-semibold text-ink">Nenhuma imagem encontrada</p>
          <p className="max-w-[52ch] text-sm text-muted">
            {q ? `Nada corresponde a "${q}"${currentClient ? ` em ${currentClient}` : ""}.` : `${currentClient} ainda não tem imagens.`} Tente outro
            termo ou envie uma imagem nova.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              startNav(() => router.replace("/midia", { scroll: false }));
            }}
          >
            Limpar filtros
          </Button>
        </div>
      )}
    </DropArea>
  );
}
