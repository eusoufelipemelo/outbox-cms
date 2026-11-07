import type { MediaMime } from "@/components/media/constants";

/** Formato real da imagem pelos primeiros bytes (não confia na extensão nem no tipo enviado). */
export function sniffImage(b: Uint8Array): MediaMime | null {
  const ascii = (f: number, t: number) => String.fromCharCode(...b.subarray(f, t));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}
