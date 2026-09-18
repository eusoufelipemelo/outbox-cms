import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusDot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { connectionLabel, connectionTone } from "./options";

/** Link "voltar" usado no `back` do PageHeader. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Bolinha com a cor da marca do cliente (decorativa). */
export function BrandDot({ color, className }: { color: string | null; className?: string }) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** Indicador do último teste de conexão, com texto para leitores de tela. */
export function ConnectionDot({ ok }: { ok: boolean | null }) {
  return (
    <span className="inline-flex" title={connectionLabel(ok)}>
      <StatusDot tone={connectionTone(ok)} />
      <span className="sr-only">{connectionLabel(ok)}</span>
    </span>
  );
}
