"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Seletor de cliente para telas com centenas de clientes: um campo que busca por nome, nicho,
 * cidade e UF, mostra por qual deles o cliente apareceu e troca de cliente sem sair do lugar.
 * As setas passam para o anterior/próximo da lista filtrada.
 */

export type PickerClient = {
  id: string;
  name: string;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  /** Texto curto à direita (ex.: "Ligada", "Pacote completo"). */
  meta?: string | null;
  /** Cor do ponto à esquerda. */
  tone?: "ok" | "warn" | "danger" | "info" | "neutral";
};

const fold = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const DOT = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-info", neutral: "bg-line-strong" } as const;
const MAX = 60;

function where(c: PickerClient) {
  return [c.segment, c.city && c.state ? `${c.city}/${c.state}` : c.city || c.state].filter(Boolean).join(", ");
}

export function ClientPicker({
  clients,
  value,
  onChange,
  placeholder = "Buscar cliente por nome, nicho, cidade ou UF",
  label = "Cliente",
  extra,
}: {
  clients: PickerClient[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  label?: string;
  /** Conteúdo ao lado das setas (ex.: filtros). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = clients.find((c) => c.id === value) ?? null;

  const results = useMemo(() => {
    const q = fold(query).trim();
    if (!q) return clients.slice(0, MAX).map((c) => ({ c, hit: null as string | null }));
    const out: { c: PickerClient; hit: string | null; rank: number }[] = [];
    for (const c of clients) {
      const name = fold(c.name);
      if (name.startsWith(q)) out.push({ c, hit: null, rank: 0 });
      else if (name.includes(q)) out.push({ c, hit: null, rank: 1 });
      else if (fold(c.segment).includes(q)) out.push({ c, hit: `nicho: ${c.segment}`, rank: 2 });
      else if (fold(c.city).includes(q)) out.push({ c, hit: `cidade: ${c.city}`, rank: 2 });
      else if (q.length === 2 && fold(c.state) === q) out.push({ c, hit: `UF: ${c.state}`, rank: 3 });
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, MAX);
  }, [clients, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) choose(r.c.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const index = selected ? clients.findIndex((c) => c.id === selected.id) : -1;
  const step = (d: number) => {
    if (!clients.length) return;
    const next = clients[(index + d + clients.length) % clients.length];
    if (next) onChange(next.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={box} className="relative min-w-0 flex-1 basis-72">
        <label className="sr-only" htmlFor={`${listId}-input`}>
          {label}
        </label>
        <div
          className={cn(
            "flex h-12 items-center gap-2 rounded-[var(--radius-control)] border bg-surface px-3 transition-colors",
            open ? "border-ink ring-2 ring-brand/25" : "border-line-strong hover:border-line-hover",
          )}
          onClick={() => {
            setOpen(true);
            input.current?.focus();
          }}
        >
          <Search className="size-4 shrink-0 text-faint" aria-hidden />
          <input
            id={`${listId}-input`}
            ref={input}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            aria-activedescendant={open && results[active] ? `${listId}-${results[active].c.id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            value={open ? query : ""}
            placeholder={selected && !open ? "" : placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={onKey}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
          />
          {selected && !open ? (
            <span className="pointer-events-none absolute inset-y-0 left-10 right-10 flex items-center gap-2 truncate">
              <span className="truncate text-[15px] font-semibold text-ink">{selected.name}</span>
              {where(selected) ? <span className="hidden truncate text-[13px] text-muted sm:inline">{where(selected)}</span> : null}
            </span>
          ) : null}
          <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-180")} aria-hidden />
        </div>

        {open ? (
          <div className="absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface shadow-[var(--shadow-pop)]">
            <ul id={`${listId}-list`} role="listbox" className="max-h-[min(55vh,420px)] overflow-y-auto py-1">
              {results.map(({ c, hit }, i) => (
                <li
                  key={c.id}
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={c.id === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c.id);
                  }}
                  className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2", i === active && "bg-sunken")}
                >
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[c.tone ?? "neutral"])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{hit ?? (where(c) || "Sem nicho e cidade")}</span>
                  </span>
                  {c.meta ? <span className="shrink-0 text-[12px] text-muted">{c.meta}</span> : null}
                  {c.id === value ? <Check className="size-4 shrink-0 text-ink" aria-hidden /> : null}
                </li>
              ))}
              {results.length === 0 ? <li className="px-3 py-6 text-center text-[13.5px] text-muted">Nenhum cliente com “{query}”.</li> : null}
            </ul>
            <p className="border-t border-line px-3 py-1.5 text-[12px] text-faint">
              {query ? `${results.length === MAX ? `${MAX}+` : results.length} encontrado(s)` : `${clients.length} cliente(s)`}. Setas para navegar, Enter para abrir.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={clients.length < 2}
          aria-label="Cliente anterior"
          className="flex size-12 items-center justify-center rounded-[var(--radius-control)] border border-line-strong text-muted hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="min-w-14 text-center text-[12.5px] text-muted tabular-nums">
          {index >= 0 ? `${index + 1}/${clients.length}` : `${clients.length}`}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={clients.length < 2}
          aria-label="Próximo cliente"
          className="flex size-12 items-center justify-center rounded-[var(--radius-control)] border border-line-strong text-muted hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      {extra}
    </div>
  );
}
