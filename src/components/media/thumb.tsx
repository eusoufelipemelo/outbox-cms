import Image from "next/image";
import { cn } from "@/lib/utils";

function optimizable(url: string) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** Miniatura quadrada com carregamento preguiçoso. */
export function Thumb({ url, alt, sizes, className }: { url: string; alt: string; sizes: string; className?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-sunken", className)}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        loading="lazy"
        unoptimized={!optimizable(url)}
        className="object-cover"
      />
    </div>
  );
}
