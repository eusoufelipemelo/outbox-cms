"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FilePlus2, ImagePlus, Search, UserPlus, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-items";

export type PaletteClient = { id: string; name: string; segment: string | null; city: string | null; state: string | null };

type Entry = { id: string; group: "Ações" | "Telas" | "Clientes"; label: string; detail: string; href: string; icon: LucideIcon; haystack: string };

const fold = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ACTIONS: Omit<Entry, "haystack">[] = [
  { id: "a-artigo", group: "Ações", label: "Novo artigo", detail: "Escrever um artigo do zero ou com a IA", href: "/artigos/novo", icon: FilePlus2 },
  { id: "a-cliente", group: "Ações", label: "Novo cliente", detail: "Cadastrar cliente e site", href: "/clientes/novo", icon: UserPlus },
  { id: "a-imagem", group: "Ações", label: "Gerar imagem com IA", detail: "Em Mídia", href: "/midia", icon: ImagePlus },
];

const MAX_CLIENTS = 8;

/** Busca rápida: telas, clientes e ações. Abre com ⌘K (ou Ctrl+K). */
export function CommandPalette({ clients, isAdmin, onNavigate }: { clients: PaletteClient[]; isAdmin: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = NAV_GROUPS.filter((g) => isAdmin || !g.adminOnly).flatMap((g) =>
      g.items.map((it) => ({
        id: `p-${it.href}`,
        group: "Telas" as const,
        label: it.label,
        detail: it.hint,
        href: it.href,
        icon: it.icon,
        haystack: fold([it.label, it.hint, g.label, ...it.keywords].join(" ")),
      })),
    );
    const actions = ACTIONS.map((a) => ({ ...a, haystack: fold(`${a.label} ${a.detail}`) }));
    const people: Entry[] = clients.map((c) => ({
      id: `c-${c.id}`,
      group: "Clientes",
      label: c.name,
      detail: [c.segment, c.city && c.state ? `${c.city}/${c.state}` : c.city || c.state].filter(Boolean).join(", "),
      href: `/clientes/${c.id}`,
      icon: Users,
      haystack: fold([c.name, c.segment, c.city, c.state].join(" ")),
    }));
    return [...actions, ...pages, ...people];
  }, [clients, isAdmin]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return entries.filter((e) => e.group !== "Clientes");
    const hits = entries.filter((e) => words.every((w) => e.haystack.includes(w)));
    // nome que começa com o termo vem primeiro
    hits.sort((a, b) => Number(fold(b.label).startsWith(words[0])) - Number(fold(a.label).startsWith(words[0])));
    let clientCount = 0;
    return hits.filter((e) => e.group !== "Clientes" || ++clientCount <= MAX_CLIENTS);
  }, [entries, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  const go = (e: Entry | undefined) => {
    if (!e) return;
    close();
    onNavigate?.();
    router.push(e.href);
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") close();
  };

  // ⌘ no Mac, Ctrl no resto; no servidor fica Ctrl até o navegador responder
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /mac/i.test(navigator.platform),
    () => false,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-sunken px-3 text-left text-[13.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Buscar ou ir para…</span>
        <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] text-faint">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar no CMS">
          <button type="button" aria-label="Fechar busca" className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative w-full max-w-[560px] overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-[18px] shrink-0 text-faint" aria-hidden />
              <input
                ref={input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder="Tela, cliente ou ação (ex.: chaves, checklist, Ápice)"
                aria-label="Buscar"
                aria-controls="palette-results"
                aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
                className="h-12 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-faint">Esc</kbd>
            </div>
            <ul ref={list} id="palette-results" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado para “{query}”. Tente outra palavra, como o nome do cliente ou da tela.</li>
              ) : (
                results.map((e, i) => {
                  const Icon = e.icon;
                  const header = i === 0 || results[i - 1].group !== e.group;
                  return (
                    <li key={e.id} role="presentation">
                      {header ? <p className="px-3 pt-2 pb-1 text-[12px] font-medium text-faint">{e.group}</p> : null}
                      <button
                        type="button"
                        id={`palette-${e.id}`}
                        role="option"
                        aria-selected={i === active}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(e)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left",
                          i === active ? "bg-sunken text-ink" : "text-text",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{e.label}</span>
                          {e.detail ? <span className="block truncate text-[12.5px] text-muted">{e.detail}</span> : null}
                        </span>
                        {i === active ? <CornerDownLeft className="size-3.5 shrink-0 text-faint" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
