import Link from "next/link";
import { List, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Alterna entre a lista de clientes e o mapa por estado. */
export function ClientViewTabs({ current }: { current: "lista" | "mapa" }) {
  const tabs = [
    { key: "lista", href: "/clientes", label: "Lista", icon: List },
    { key: "mapa", href: "/clientes/mapa", label: "Mapa", icon: MapIcon },
  ] as const;
  return (
    <nav aria-label="Modo de visualização" className="inline-flex rounded-[var(--radius-control)] border border-line-strong bg-surface p-0.5">
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm transition-colors",
            current === key ? "bg-ink font-medium text-on-ink" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
