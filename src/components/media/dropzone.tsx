"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, ImageUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEDIA_ACCEPT } from "./constants";
import type { UploadItem } from "./upload";

export type FilePickerHandle = { open: () => void };

function filesFrom(list: FileList | null | undefined): File[] {
  return list ? Array.from(list) : [];
}

/** Input de arquivo escondido, aberto por `ref.open()`. */
export const HiddenFileInput = forwardRef<FilePickerHandle, { onFiles: (files: File[]) => void; id?: string }>(function HiddenFileInput(
  { onFiles, id },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ open: () => input.current?.click() }), []);
  return (
    <input
      ref={input}
      id={id}
      type="file"
      accept={MEDIA_ACCEPT}
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const files = filesFrom(e.target.files);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
});

/** Área que aceita imagens arrastadas; `children` fica por cima. */
export function DropArea({
  onFiles,
  children,
  className,
  overlayLabel = "Solte para enviar",
}: {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  overlayLabel?: string;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = filesFrom(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      {children}
      {over ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-panel)] border-2 border-dashed border-ink bg-surface/90"
        >
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ImageUp className="size-5" aria-hidden />
            {overlayLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Caixa tracejada de envio, usada no estado vazio e na aba "Enviar" do seletor. */
export function UploadBox({ onFiles, title, compact }: { onFiles: (files: File[]) => void; title?: string; compact?: boolean }) {
  const picker = useRef<FilePickerHandle>(null);
  return (
    <DropArea onFiles={onFiles}>
      <div
        className={cn(
          "flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface",
          compact ? "px-5 py-6" : "px-6 py-10",
        )}
      >
        <ImageUp className="size-6 text-muted" aria-hidden />
        <div>
          <p className="text-[16px] font-semibold text-ink">{title ?? "Arraste imagens para cá"}</p>
          <p className="mt-1 max-w-[52ch] text-sm text-muted">JPG, PNG, WebP, GIF ou AVIF, até 2 MB cada. Fotos maiores são reduzidas e convertidas para WebP automaticamente. Dá para enviar várias de uma vez.</p>
        </div>
        <Button variant="primary" onClick={() => picker.current?.open()}>
          Escolher imagens
        </Button>
        <HiddenFileInput ref={picker} onFiles={onFiles} />
      </div>
    </DropArea>
  );
}

/** Progresso de cada arquivo enviado. */
export function UploadQueue({ items, onDismiss, className }: { items: UploadItem[]; onDismiss: (id: string) => void; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn("divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface", className)} aria-live="polite">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="shrink-0">
            {it.status === "uploading" ? (
              <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
            ) : it.status === "done" ? (
              <Check className="size-4 text-ok" aria-hidden />
            ) : (
              <AlertCircle className="size-4 text-danger" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-[13.5px] font-medium text-ink">{it.name}</p>
              <p className={cn("shrink-0 text-[12.5px] tabular-nums", it.status === "error" ? "text-danger" : "text-muted")}>
                {it.status === "uploading" ? `${Math.round(it.progress * 100)}%` : it.status === "done" ? "Enviada" : "Não enviada"}
              </p>
            </div>
            {it.status === "uploading" ? (
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-label={`Enviando ${it.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(it.progress * 100)}
              >
                <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${Math.max(3, it.progress * 100)}%` }} />
              </div>
            ) : it.error ? (
              <p className="mt-0.5 text-[13px] text-danger">{it.error}</p>
            ) : null}
          </div>
          {it.status !== "uploading" ? (
            <button
              type="button"
              onClick={() => onDismiss(it.id)}
              aria-label={`Remover ${it.name} da lista`}
              className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
