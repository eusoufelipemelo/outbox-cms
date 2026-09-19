"use client";

import { useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Check, CircleAlert, Ellipsis, Eye, LoaderCircle } from "lucide-react";
import { Badge, PostStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { PostStatus } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { formatTime } from "./datetime";
import { ClientDot, Dialog, Menu, Popover, Tip, revealRailSection, type MenuItem } from "./primitives";

export type SaveState = "new" | "dirty" | "saving" | "saved" | "error";

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia("(max-width: 639px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useIsNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

function SaveIndicator({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  savedAt: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  const label =
    state === "new"
      ? "Rascunho novo"
      : state === "saving"
        ? "Salvando…"
        : state === "dirty"
          ? "Alterações não salvas"
          : state === "error"
            ? "Não foi possível salvar"
            : savedAt
              ? `Salvo às ${formatTime(savedAt)}`
              : "Salvo";
  const icon =
    state === "saving" ? (
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
    ) : state === "error" ? (
      <CircleAlert className="size-4" aria-hidden />
    ) : state === "saved" ? (
      <Check className="size-4" aria-hidden />
    ) : (
      <span aria-hidden className={cn("mx-1 size-2 rounded-full", state === "dirty" ? "bg-warn" : "bg-line-strong")} />
    );
  return (
    <div className="flex min-w-0 items-center gap-1">
      <p
        role="status"
        title={error ?? undefined}
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-[13px]",
          state === "error" ? "text-danger" : state === "saved" ? "text-muted" : "text-muted",
        )}
      >
        {icon}
        <span className="max-sm:sr-only truncate">{label}</span>
      </p>
      {state === "error" ? (
        <Button variant="ghost" size="sm" className="h-10" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export interface ScoreSummary {
  seo: { score: number; total: number };
  geo: { score: number; total: number };
}

function ScoreBadge({ name, score, total, target }: { name: string; score: number; total: number; target: string }) {
  const pct = total ? score / total : 0;
  return (
    <button
      type="button"
      onClick={() => revealRailSection(target)}
      aria-label={`${name}: ${score} de ${total} itens atendidos. Ver checklist`}
      className="inline-flex h-10 cursor-pointer items-center rounded-[var(--radius-control)] px-0.5"
    >
      <Badge tone={pct >= 0.8 ? "ok" : pct >= 0.5 ? "warn" : "neutral"} className="tabular-nums">
        <span className="font-semibold">{name}</span> {score} de {total}
      </Badge>
    </button>
  );
}

export interface PublishTarget {
  siteId: string;
  name: string;
  host: string;
  color: string | null;
  canonical: boolean;
  live: boolean;
}

function PublishButton({
  targets,
  published,
  unsent,
  busy,
  onPublish,
}: {
  targets: PublishTarget[];
  published: boolean;
  unsent: boolean;
  busy: boolean;
  onPublish: () => void;
}) {
  const [open, setOpen] = useState(false);
  const n = targets.length;
  const verb = published ? "Atualizar" : "Publicar";
  const label = `${verb} em ${n} ${n === 1 ? "site" : "sites"}`;
  const canonical = targets.find((t) => t.canonical);

  if (n === 0) {
    return (
      <Tip label="Escolha ao menos um site em Destinos" side="bottom">
        <Button variant="publish" disabled aria-describedby="publish-disabled-reason">
          Publicar
        </Button>
        <span id="publish-disabled-reason" className="sr-only">
          Escolha ao menos um site em Destinos para publicar.
        </span>
      </Tip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={`Confirmar: ${label}`}
      className="max-sm:fixed max-sm:inset-x-4 max-sm:top-[7.75rem] max-sm:w-auto"
      trigger={
        published && !unsent && !busy ? (
          // No ar e sem alterações: só o estado, discreto. Clicar ainda permite reenviar.
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-popover-trigger
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden className="size-2 rounded-full bg-ok" />
            {`No ar em ${n} ${n === 1 ? "site" : "sites"}`}
          </Button>
        ) : (
          <Button
            variant="publish"
            loading={busy}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-popover-trigger
            onClick={() => setOpen((o) => !o)}
          >
            {label}
          </Button>
        )
      }
    >
      <p className="text-[15px] font-semibold text-ink">{published && !unsent ? `Reenviar para ${n} ${n === 1 ? "site" : "sites"}` : label}</p>
      <p className="mt-1 text-[13px] text-muted">
        {!published
          ? "O artigo vai ao ar agora nestes sites:"
          : unsent
            ? "As alterações salvas vão ao ar agora nestes sites:"
            : "Os sites já estão com a versão atual. Enviar de novo para:"}
      </p>
      <ul className="mt-3 max-h-60 space-y-1.5 overflow-y-auto">
        {targets.map((t) => (
          <li key={t.siteId} className="flex items-center gap-2 text-sm">
            <ClientDot color={t.color} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-ink">{t.name}</span> <span className="text-muted">{t.host}</span>
            </span>
            {t.canonical ? <Badge tone="info">Original</Badge> : null}
          </li>
        ))}
      </ul>
      {canonical && n > 1 ? (
        <p className="mt-3 text-[12.5px] text-muted">Os outros sites apontam para {canonical.host} como fonte original.</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          variant="publish"
          autoFocus
          onClick={() => {
            setOpen(false);
            onPublish();
          }}
        >
          {!published ? "Publicar agora" : unsent ? "Atualizar agora" : "Reenviar agora"}
        </Button>
      </div>
    </Popover>
  );
}

export function ScheduleDialog({
  open,
  onClose,
  status,
  value,
  onChange,
  onSchedule,
  onCancelSchedule,
  busy,
  destinationCount,
}: {
  open: boolean;
  onClose: () => void;
  status: PostStatus;
  value: string;
  onChange: (value: string) => void;
  onSchedule: () => void;
  onCancelSchedule: () => void;
  busy: boolean;
  destinationCount: number;
}) {
  const scheduled = status === "scheduled";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={scheduled ? "Publicação agendada" : "Agendar publicação"}
      description={
        destinationCount === 0
          ? "Escolha ao menos um site em Destinos antes de agendar."
          : `O artigo vai ao ar sozinho em ${destinationCount} ${destinationCount === 1 ? "site" : "sites"} na data escolhida.`
      }
      footer={
        <>
          {scheduled ? (
            <Button variant="danger" onClick={onCancelSchedule} disabled={busy} className="mr-auto">
              Cancelar agendamento
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onSchedule} loading={busy} disabled={!value || destinationCount === 0}>
            {scheduled ? "Reagendar" : "Agendar publicação"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSchedule();
        }}
      >
        <Field label="Data e horário" htmlFor="schedule-at" hint="Horário de Brasília.">
          <Input id="schedule-at" type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

export function TopBar({
  saveState,
  savedAt,
  saveError,
  onRetrySave,
  status,
  scheduledAt,
  onBack,
  onPreview,
  targets,
  unsent,
  publishing,
  onPublish,
  onOpenSchedule,
  menuItems,
  scores,
}: {
  saveState: SaveState;
  savedAt: string | null;
  saveError: string | null;
  onRetrySave: () => void;
  status: PostStatus;
  scheduledAt: string | null;
  onBack: (e: MouseEvent<HTMLAnchorElement>) => void;
  onPreview: () => void;
  targets: PublishTarget[];
  /** Publicado, mas o texto salvo é mais novo que a versão no ar em algum site. */
  unsent: boolean;
  publishing: boolean;
  onPublish: () => void;
  onOpenSchedule: () => void;
  menuItems: MenuItem[];
  scores?: ScoreSummary;
}) {
  const scheduled = status === "scheduled" && scheduledAt;
  return (
    <header className="sticky top-14 z-30 border-b border-line bg-paper/95 backdrop-blur lg:top-0">
      <div className="flex h-16 items-center gap-1.5 px-4 sm:gap-2 sm:px-6 lg:px-10">
        <Link
          href="/artigos"
          onClick={onBack}
          aria-label="Voltar para Artigos"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Artigos</span>
        </Link>
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SaveIndicator state={saveState} savedAt={savedAt} error={saveError} onRetry={onRetrySave} />
          {unsent ? (
            <p className="ml-auto flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-warn">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn" />
              <span className="truncate max-sm:sr-only">Alterações ainda não enviadas aos sites</span>
            </p>
          ) : null}
        </div>
        <div className="hidden md:block">
          {status !== "draft" ? <PostStatusBadge status={status} /> : null}
        </div>
        {scores ? (
          <div className="hidden items-center xl:flex" role="group" aria-label="Pontuação do artigo">
            <ScoreBadge name="SEO" score={scores.seo.score} total={scores.seo.total} target="editor-seo" />
            <ScoreBadge name="GEO" score={scores.geo.score} total={scores.geo.total} target="editor-geo" />
          </div>
        ) : null}
        <Tip label="Pré-visualizar" side="bottom">
          <Button variant="ghost" onClick={onPreview} aria-label="Pré-visualizar" className="max-lg:w-10 max-lg:justify-center max-lg:px-0">
            <Eye className="size-4" aria-hidden />
            <span className="hidden lg:inline">Pré-visualizar</span>
          </Button>
        </Tip>
        {status !== "published" ? (
          <Button variant="secondary" onClick={onOpenSchedule} className="hidden sm:inline-flex">
            <CalendarClock className="size-4" aria-hidden />
            {scheduled ? `Agendado para ${formatDateTime(scheduledAt)}` : "Agendar"}
          </Button>
        ) : null}
        <PublishButton targets={targets} published={status === "published"} unsent={unsent} busy={publishing} onPublish={onPublish} />
        <Menu
          label="Mais ações"
          items={menuItems}
          trigger={(props) => (
            <Button variant="ghost" size="icon" aria-label="Mais ações" {...props}>
              <Ellipsis className="size-5" aria-hidden />
            </Button>
          )}
        />
      </div>
    </header>
  );
}
