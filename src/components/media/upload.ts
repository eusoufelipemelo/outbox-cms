"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";
import { validateImageFile } from "./constants";

/** Lê largura e altura no navegador antes do envio. */
export async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // cai para <img> abaixo (ex.: AVIF em navegadores antigos)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** POST /api/media com progresso (XHR, porque fetch não informa progresso de envio). */
export function uploadMedia(
  file: File,
  opts: { alt?: string; clientId?: string | null; width?: number; height?: number; onProgress?: (fraction: number) => void },
): Promise<Media> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    if (opts.alt) body.append("alt", opts.alt);
    if (opts.clientId) body.append("client_id", opts.clientId);
    if (opts.width) body.append("width", String(opts.width));
    if (opts.height) body.append("height", String(opts.height));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.response as (Media & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && data?.id) resolve(data);
      else if (xhr.status === 401) reject(new Error("Sua sessão expirou. Entre novamente para enviar imagens."));
      else reject(new Error(data?.error || "Não foi possível enviar a imagem. Tente de novo."));
    };
    xhr.onerror = () => reject(new Error("Sem conexão com o servidor. Confira a internet e tente de novo."));
    xhr.send(body);
  });
}

export type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

/** Fila de envio com até 3 arquivos em paralelo. */
export function useUploader({ clientId, onUploaded }: { clientId?: string | null; onUploaded: (media: Media) => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const jobs: { item: UploadItem; file: File }[] = files.map((file) => {
        const error = validateImageFile(file);
        return {
          file,
          item: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            progress: 0,
            status: error ? "error" : "uploading",
            error: error ?? undefined,
          },
        };
      });
      setItems((prev) => [...jobs.map((j) => j.item), ...prev.filter((p) => p.status === "uploading")]);

      const queue = jobs.filter((j) => j.item.status === "uploading");
      const uploaded: Media[] = [];
      async function worker() {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const { item, file } = job;
          try {
            const size = await readImageSize(file);
            const media = await uploadMedia(file, {
              clientId,
              width: size?.width,
              height: size?.height,
              onProgress: (f) => patch(item.id, { progress: Math.min(0.99, f) }),
            });
            patch(item.id, { status: "done", progress: 1 });
            uploaded.push(media);
            onUploadedRef.current(media);
          } catch (e) {
            patch(item.id, { status: "error", error: e instanceof Error ? e.message : "Não foi possível enviar a imagem." });
          }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      return uploaded;
    },
    [clientId, patch],
  );

  const dismiss = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), []);
  const clearFinished = useCallback(() => setItems((prev) => prev.filter((it) => it.status === "uploading")), []);

  return { items, addFiles, dismiss, clearFinished };
}
