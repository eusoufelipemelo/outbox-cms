"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Diálogo modal de confirmação (nativo `<dialog>`: foco preso, Esc fecha). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  pending,
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  destructive?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-text shadow-[var(--shadow-pop)] backdrop:bg-black/30"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-[17px] font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending} className="justify-center" autoFocus>
            Cancelar
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={pending} className="justify-center">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
