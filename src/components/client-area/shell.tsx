import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import type { ClientAccount, ClientCompany } from "@/lib/client-auth";
import { clientSignOut } from "@/lib/data/client-area-actions";
import { SideNav, TabBar } from "./nav";
import { CompanyMark } from "./company-mark";
import { ClientAvatar } from "./avatar";

export { CompanyMark };

function PoweredBy() {
  return (
    <a
      href="https://outboxgroup.com.br"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded text-[12.5px] text-faint transition-colors hover:text-muted"
    >
      Tecnologia
      <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={64} height={16} className="opacity-70" />
    </a>
  );
}

/** Moldura do painel do cliente: menu lateral com a marca dele (computador), barra de abas (celular). */
export function ClientShell({
  company,
  account,
  awaiting,
  preview = false,
  children,
}: {
  company: ClientCompany;
  account: ClientAccount;
  awaiting: number;
  preview?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`min-h-dvh bg-paper ${preview ? "pt-10" : ""}`}>
      {preview ? (
        <div className="fixed inset-x-0 top-0 z-40 flex h-10 items-center justify-center gap-4 bg-ink px-4 text-center text-[13.5px] text-on-ink">
          <span className="truncate">
            Você está vendo como <strong className="font-semibold">{company.name}</strong>
            <span className="hidden sm:inline">. Os botões de decisão ficam travados.</span>
          </span>
          <a href="/api/cliente-preview?sair=1" className="shrink-0 font-semibold underline underline-offset-4 hover:no-underline">
            Sair da visualização
          </a>
        </div>
      ) : null}
      <aside className={`fixed bottom-0 left-0 ${preview ? "top-10" : "top-0"} z-20 hidden w-[272px] flex-col border-r border-line bg-surface lg:flex`}>
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <CompanyMark company={company} />
          <div className="min-w-0">
            <p className="truncate text-[15.5px] leading-tight font-bold text-ink">{company.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">Área do cliente</p>
          </div>
        </div>
        <div className="mx-5 border-t border-line" />
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SideNav awaiting={awaiting} />
        </div>
        <div className="space-y-4 border-t border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <Link href="/cliente/conta" aria-label="Minha conta" className="rounded-full">
              <ClientAvatar url={account.avatarUrl} size={36} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{account.name}</p>
              <p className="truncate text-[12.5px] text-muted">{account.email}</p>
            </div>
            <form action={clientSignOut}>
              <button
                type="submit"
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors hover:bg-sunken hover:text-ink"
                aria-label="Sair da área do cliente"
                title="Sair"
              >
                <LogOut className="size-[18px]" aria-hidden />
              </button>
            </form>
          </div>
          <PoweredBy />
        </div>
      </aside>

      <header className={`sticky ${preview ? "top-10" : "top-0"} z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden`}>
        <CompanyMark company={company} size={36} />
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{company.name}</p>
        <Link
          href="/cliente/conta"
          className="inline-flex size-10 items-center justify-center rounded-full"
          aria-label="Minha conta"
        >
          <ClientAvatar url={account.avatarUrl} size={38} />
        </Link>
      </header>

      <main className="lg:pl-[272px]">
        <div className="mx-auto w-full max-w-[1080px] px-4 pt-6 pb-28 sm:px-6 lg:px-12 lg:pt-12 lg:pb-16">{children}</div>
      </main>

      <TabBar awaiting={awaiting} />
    </div>
  );
}

/** Título de página da área do cliente: Archivo largo, uma frase de apoio. */
export function ClientPageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[640px]">
        <h1 className="display text-[30px] sm:text-[38px]">{title}</h1>
        {description ? <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
