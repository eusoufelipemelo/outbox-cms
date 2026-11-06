"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleCheckBig, Globe, House, Lightbulb, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; short: string; icon: LucideIcon; exact?: boolean; badge?: "awaiting" };

export const CLIENT_NAV: Item[] = [
  { href: "/cliente", label: "Início", short: "Início", icon: House, exact: true },
  { href: "/cliente/aprovar", label: "Para aprovar", short: "Aprovar", icon: CircleCheckBig, badge: "awaiting" },
  { href: "/cliente/publicados", label: "Publicados", short: "No ar", icon: Globe },
  { href: "/cliente/temas", label: "Sugerir temas", short: "Temas", icon: Lightbulb },
];

const ACCOUNT: Item = { href: "/cliente/conta", label: "Minha conta", short: "Conta", icon: UserRound };

function active(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/cliente/aprovar") return pathname.startsWith("/cliente/aprovar") || pathname.startsWith("/cliente/artigos");
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11.5px] leading-5 font-semibold text-on-ink tabular-nums", className)}>
      {n}
      <span className="sr-only">{n === 1 ? " artigo esperando você" : " artigos esperando você"}</span>
    </span>
  );
}

/** Menu lateral (computador). O item atual ganha o entalhe laranja do símbolo OutBox. */
export function SideNav({ awaiting }: { awaiting: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Área do cliente" className="space-y-0.5">
      {[...CLIENT_NAV, ACCOUNT].map((item) => {
        const on = active(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[14.5px] transition-colors",
              on ? "notch bg-sunken font-semibold text-ink" : "text-muted hover:bg-sunken hover:text-ink",
              item === ACCOUNT && "mt-4",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden strokeWidth={on ? 2.2 : 1.8} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? <Count n={awaiting} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra de abas no celular: as quatro telas do dia a dia ao alcance do polegar. */
export function TabBar({ awaiting }: { awaiting: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Área do cliente"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-[560px] grid-cols-4">
        {CLIENT_NAV.map((item) => {
          const on = active(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[12px]", on ? "font-semibold text-ink" : "text-muted")}
              >
                <span className="relative">
                  <Icon className="size-[22px]" aria-hidden strokeWidth={on ? 2.2 : 1.7} />
                  {item.badge ? <Count n={awaiting} className="absolute -top-2 -right-3.5 min-w-[18px] text-[10.5px] leading-[18px]" /> : null}
                </span>
                {item.short}
                <span aria-hidden className={cn("h-[3px] w-5 rounded-full", on ? "bg-brand" : "bg-transparent")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
