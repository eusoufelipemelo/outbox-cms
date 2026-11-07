import { UserRound } from "lucide-react";

/** Foto de perfil do cliente, ou um ícone neutro enquanto ele não enviar uma. */
export function ClientAvatar({ url, size = 36, className = "" }: { url: string | null; size?: number; className?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto do perfil, já reduzida no envio
      <img src={url} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sunken text-muted ${className}`} style={{ width: size, height: size }}>
      <UserRound style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
    </span>
  );
}
