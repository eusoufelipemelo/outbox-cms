"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============ Tooltip visual (o nome acessível fica no aria-label do controle) ============

export function Tip({ label, children, side = "top", className }: { label: string; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-on-ink opacity-0 transition-opacity delay-300 duration-100 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ============ Dialog (elemento <dialog> nativo: foco preso, Esc, camada superior) ============

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(calc(100%-2rem),480px)] max-h-[calc(100dvh-2rem)] overflow-visible rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-text shadow-[var(--shadow-pop)] backdrop:bg-black/35",
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[17px] font-semibold text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="-mt-1 -mr-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
              >
                <X className="size-5" aria-hidden />
              </button>
            ) : null}
          </header>
          {children ? <div className="min-h-0 overflow-y-auto px-5 pb-4">{children}</div> : null}
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
}

/** Confirmação via promessa: `if (await confirm({...})) ...`. Renderize `dialog` na árvore. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );
  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const dialog = (
    <Dialog
      open={state !== null}
      onClose={() => close(false)}
      title={state?.title ?? ""}
      description={state?.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.tone === "danger" ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
            {state?.confirmLabel}
          </Button>
        </>
      }
    />
  );
  return { confirm, dialog };
}

// ============ Popover ancorado ============

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "end",
  className,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        const trig = wrapRef.current?.querySelector<HTMLElement>("[data-popover-trigger]");
        trig?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-full z-40 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--shadow-pop)]",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ============ Menu de ações ============

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
}

export function Menu({
  label,
  trigger,
  items,
  align = "end",
  header,
}: {
  label: string;
  /** Recebe as props do botão que abre o menu. */
  trigger: (props: {
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
    onKeyDown: (e: ReactKeyboardEvent) => void;
    "data-popover-trigger": true;
  }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const focusItem = (index: number) => {
    const els = listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([aria-disabled=true])");
    if (!els || !els.length) return;
    const i = ((index % els.length) + els.length) % els.length;
    els[i].focus();
  };

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => focusItem(0));
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const closeAndFocus = () => {
    setOpen(false);
    wrapRef.current?.querySelector<HTMLElement>("[data-popover-trigger]")?.focus();
  };

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const els = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
    const current = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(els.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndFocus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {trigger({
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
        "data-popover-trigger": true,
      })}
      {open ? (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-full z-40 mt-2 w-[min(300px,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {header}
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              tabIndex={-1}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex min-h-10 w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-faint"
                  : item.danger
                    ? "text-danger hover:bg-danger-soft focus:bg-danger-soft"
                    : "text-ink hover:bg-sunken focus:bg-sunken",
                "focus:outline-none focus-visible:outline-2",
              )}
            >
              {item.icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-4">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.hint ? <span className="mt-0.5 block text-[12.5px] text-muted">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ============ Seção recolhível do painel lateral ============

export const RAIL_OPEN_EVENT = "rail:open";

/** Rola até uma seção do painel lateral, abre se estiver fechada e põe o foco no cabeçalho. */
export function revealRailSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dispatchEvent(new Event(RAIL_OPEN_EVENT));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.querySelector<HTMLButtonElement>("h2 button")?.focus({ preventScroll: true });
}

export function RailSection({
  id,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  id?: string;
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onOpen = () => setOpen(true);
    el.addEventListener(RAIL_OPEN_EVENT, onOpen);
    return () => el.removeEventListener(RAIL_OPEN_EVENT, onOpen);
  }, []);
  return (
    <section ref={ref} id={id} className="scroll-mt-44 rounded-[var(--radius-panel)] border border-line bg-surface lg:scroll-mt-24">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-panel)] px-5 text-left"
        >
          <span className="flex-1 text-[15px] font-semibold text-ink">{title}</span>
          {summary ? <span className="text-[13px] text-muted">{summary}</span> : null}
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 text-muted transition-transform duration-150", open ? "rotate-180" : "")}
          />
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="border-t border-line px-5 py-5">
        {children}
      </div>
    </section>
  );
}

/** Contador de caracteres com faixa ideal. */
export function CharCounter({ value, min, max, id }: { value: string; min?: number; max: number; id?: string }) {
  const len = value.length;
  const inRange = len > 0 && len <= max && (min === undefined || len >= min);
  const label = min !== undefined ? `${len} caracteres (ideal entre ${min} e ${max})` : `${len} de ${max} caracteres`;
  return (
    <span id={id} className={cn("text-[12.5px] tabular-nums", len === 0 ? "text-muted" : inRange ? "text-ok" : "text-warn")}>
      {label}
    </span>
  );
}

export function ClientDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/20", className)}
      style={{ backgroundColor: color || "var(--color-line-strong)" }}
    />
  );
}
