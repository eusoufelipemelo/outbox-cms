"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";
import { MEDIA_MAX_BYTES, MEDIA_MAX_SIDE, validateImageFile } from "./constants";

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

/**
 * Deixa a imagem dentro do limite antes de enviar: se passar de 2 MB ou de 2400 px no lado
 * maior, reduz e converte para WebP (qualidade decrescente até caber). GIF fica como está
 * (perderia a animação) e é recusado se passar do limite.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
  const size = await readImageSize(file);
  const tooBig = file.size > MEDIA_MAX_BYTES;
  const tooWide = size ? Math.max(size.width, size.height) > MEDIA_MAX_SIDE : false;
  if (!tooBig && !tooWide) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // formato que o navegador não decodifica: segue e a validação decide
  }
  const scale = Math.min(1, MEDIA_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  for (const quality of [0.86, 0.78, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.type === "image/webp" && blob.size <= MEDIA_MAX_BYTES) {
      return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
    }
  }
  return file; // não coube: a validação mostra o erro com o tamanho
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
      const prepared = await Promise.all(files.map((f) => prepareImage(f).catch(() => f)));
      const jobs: { item: UploadItem; file: File }[] = prepared.map((file) => {
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
