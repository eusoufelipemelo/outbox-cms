import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PostStatus, PublicationStatus } from "@/lib/types";

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted border-line",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  brand: "bg-brand-soft text-brand-ink border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border px-2.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const dot: Record<Tone, string> = {
  neutral: "bg-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  brand: "bg-brand",
};

export function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", dot[tone])} />;
}

const postStatus: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "neutral" },
  scheduled: { label: "Agendado", tone: "info" },
  published: { label: "Publicado", tone: "ok" },
  archived: { label: "Arquivado", tone: "warn" },
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const s = postStatus[status];
  return (
    <Badge tone={s.tone}>
      <StatusDot tone={s.tone} />
      {s.label}
    </Badge>
  );
}

const pubStatus: Record<PublicationStatus, { label: string; tone: Tone }> = {
  pending: { label: "Aguardando", tone: "neutral" },
  published: { label: "No ar", tone: "ok" },
  failed: { label: "Falhou", tone: "danger" },
  unpublished: { label: "Despublicado", tone: "warn" },
};

export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const s = pubStatus[status];
  return (
    <Badge tone={s.tone}>
      <StatusDot tone={s.tone} />
      {s.label}
    </Badge>
  );
}
