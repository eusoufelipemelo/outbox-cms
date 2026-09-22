"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot, CalendarDays, SlidersHorizontal, Gauge, Map as MapIcon, Lightbulb, FileText, Images, LayoutGrid, LogOut, Menu, Plug, Plus, UserCog, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const items = [
  { href: "/", label: "Painel", icon: LayoutGrid, exact: true },
  { href: "/clientes", label: "Clientes e sites", icon: Users },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/artigos", label: "Artigos", icon: FileText },
  { href: "/pautas", label: "Pautas", icon: Lightbulb },
  { href: "/automacao", label: "Automação", icon: Bot },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/midia", label: "Mídia", icon: Images },
  { href: "/diagnosticos", label: "Diagnóstico", icon: Gauge },
  { href: "/integracoes", label: "Integrações", icon: Plug },
];

// Só administradores veem (e acessam) a gestão da equipe.
const adminItems = [
  { href: "/equipe", label: "Equipe", icon: UserCog, exact: false },
  { href: "/painel", label: "Painel admin", icon: SlidersHorizontal, exact: false },
];

export type NavUser = { name: string; email: string; role: "admin" | "editor" | "writer"; avatarUrl: string | null; jobTitle: string | null };

function NavLinks({ user, pendingCount, onNavigate }: { user: NavUser; pendingCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const links = user.role === "admin" ? [...items, ...adminItems] : items;
  return (
    <ul className="space-y-0.5">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const badge = href === "/equipe" && pendingCount > 0 ? pendingCount : 0;
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[14.5px] transition-colors duration-150",
                active ? "bg-sunken font-semibold text-ink" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              {active ? <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-brand" /> : null}
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
              {label}
              {badge ? (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11.5px] font-semibold text-on-ink tabular-nums">
                  {badge}
                  <span className="sr-only"> {badge === 1 ? "conta aguardando aprovação" : "contas aguardando aprovação"}</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type ShellProps = { user: NavUser; pendingCount?: number; signOut: () => Promise<void> };

function SidebarBody({ user, pendingCount = 0, signOut, onNavigate }: ShellProps & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <Link href="/" onClick={onNavigate} aria-label="OutBox CMS, ir para o painel" className="inline-flex items-end gap-2">
          <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={122} height={30} priority className="dark:hidden" />
          <Image src="/brand/logo-horizontal-branco.svg" alt="OutBox" width={122} height={30} priority className="hidden dark:block" />
          <span className="mb-[1px] text-[12px] font-semibold text-brand-ink">CMS</span>
        </Link>
      </div>
      <div className="px-3">
        <Link
          href="/artigos/novo"
          onClick={onNavigate}
          className="mb-5 flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-ink text-sm font-medium text-on-ink transition-colors hover:bg-ink-hover"
        >
          <Plus className="size-4" aria-hidden /> Novo artigo
        </Link>
      </div>
      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
        <NavLinks user={user} pendingCount={pendingCount} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-line p-3">
        <ThemeToggle className="mb-2" />
        <div className="flex items-center gap-1">
          <Link
            href="/perfil"
            onClick={onNavigate}
            title="Meu perfil"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-sunken"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do perfil (R2 ou Google)
              <img src={user.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-on-ink uppercase">
                {user.name.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[12px] text-muted">{user.jobTitle || user.email}</span>
            </span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppNav({ user, pendingCount = 0, signOut }: ShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* desktop */}
      <aside className="print:hidden fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-surface lg:block">
        <SidebarBody user={user} pendingCount={pendingCount} signOut={signOut} />
      </aside>

      {/* mobile */}
      <div className="print:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="OutBox CMS">
          <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={104} height={26} priority className="dark:hidden" />
          <Image src="/brand/logo-horizontal-branco.svg" alt="OutBox" width={104} height={26} priority className="hidden dark:block" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-sunken"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-surface shadow-[var(--shadow-pop)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute top-5 right-3 inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sunken"
            >
              <X className="size-5" />
            </button>
            <SidebarBody user={user} pendingCount={pendingCount} signOut={signOut} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
