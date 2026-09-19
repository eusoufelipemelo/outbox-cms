// Regras de upload compartilhadas entre o navegador e o POST /api/media.

/** 2 MB por imagem: o navegador reduz e converte para WebP antes de enviar (ver upload.ts). */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
/** Lado maior depois da redução automática. */
export const MEDIA_MAX_SIDE = 2400;
export const MEDIA_PAGE_SIZE = 30;
export const MEDIA_ALT_MAX = 300;

/** Tipos aceitos e a extensão gravada no Storage. SVG fica de fora (pode carregar script). */
export const MEDIA_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;

export type MediaMime = keyof typeof MEDIA_TYPES;

export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES).join(",");

export function isMediaMime(value: string): value is MediaMime {
  return Object.prototype.hasOwnProperty.call(MEDIA_TYPES, value);
}

const sizeFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFmt.format(bytes / 1024)} KB`;
  return `${sizeFmt.format(bytes / (1024 * 1024))} MB`;
}

/** Mensagem de erro em pt-BR, ou null se o arquivo pode ser enviado. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!isMediaMime(file.type)) {
    return "Formato não aceito. Envie JPG, PNG, WebP, GIF ou AVIF.";
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return `A imagem tem ${formatBytes(file.size)} e o limite é 2 MB. Comprima o arquivo e envie de novo.`;
  }
  if (file.size === 0) return "O arquivo está vazio. Escolha outra imagem.";
  return null;
}
