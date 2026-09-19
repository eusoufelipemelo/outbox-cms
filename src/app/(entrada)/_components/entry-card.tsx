import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "login" | "cadastro";

function withNext(path: string, next?: string) {
  return next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** Alternância Entrar / Criar conta: são duas rotas, então são links. */
function EntrySwitch({ active, next }: { active: Tab; next?: string }) {
  const tabs: { id: Tab; href: string; label: string }[] = [
    { id: "login", href: withNext("/login", next), label: "Entrar" },
    { id: "cadastro", href: withNext("/cadastro", next), label: "Criar conta" },
  ];
  return (
    <nav aria-label="Entrar ou criar conta" className="mb-7 grid grid-cols-2 gap-1 rounded-[12px] border border-line bg-sunken p-1">
      {tabs.map((tab) => {
        const current = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center rounded-[9px] text-[14.5px] transition-colors duration-150",
              current
                ? "border border-line-strong bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                : "font-medium text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function EntryCard({
  title,
  description,
  tab,
  next,
  notice,
  children,
}: {
  title: string;
  description?: ReactNode;
  tab?: Tab;
  next?: string;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-8">
      {tab ? <EntrySwitch active={tab} next={next} /> : null}
      <h1 className="display text-[26px] sm:text-[28px]">{title}</h1>
      {description ? <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{description}</p> : null}
      {notice ? <div className="mt-5">{notice}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[13px] text-muted">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Rodapé das telas de entrada. */
export function EntryFootnote() {
  return <p className="mt-5 px-1 text-center text-[13px] text-muted">Contas novas passam por aprovação da equipe OutBox.</p>;
}
