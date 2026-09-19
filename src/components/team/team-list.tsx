"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, UserRoundCheck } from "lucide-react";
import { removeTeamMember, updateTeamMember, type TeamChange } from "@/lib/data/team-actions";
import { Select } from "@/components/ui/field";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/clients/confirm-dialog";
import { formatDate } from "@/lib/utils";
import type { Profile, ProfileStatus } from "@/lib/types";

const STATUS: Record<ProfileStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  pending: { label: "Aguardando", tone: "warn" },
  active: { label: "Ativo", tone: "ok" },
  blocked: { label: "Bloqueado", tone: "danger" },
};

function Avatar({ profile }: { profile: Profile }) {
  const initial = (profile.name || profile.email || "?").slice(0, 1).toUpperCase();
  if (profile.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto do Google, domínio externo variável
      <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full bg-sunken object-cover" />
    );
  }
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-on-ink">
      {initial}
    </span>
  );
}

type Pending = { id: string; change: TeamChange } | null;
type Confirm = { profile: Profile; change: "block" | "remove" | "demote"; to?: TeamChange } | null;

const ROLE_LABEL = { admin: "Administrador", editor: "Editor", writer: "Redator" } as const;
const ROLE_CHANGE: Record<string, TeamChange> = { admin: "make_admin", editor: "make_editor", writer: "make_writer" };

function MemberRow({
  profile,
  isMe,
  busy,
  run,
  ask,
}: {
  profile: Profile;
  isMe: boolean;
  busy: Pending;
  run: (p: Profile, change: TeamChange) => void;
  ask: (c: Confirm) => void;
}) {
  const status = STATUS[profile.status];
  const loading = (change: TeamChange) => busy?.id === profile.id && busy.change === change;
  const disabled = busy !== null;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {profile.name || profile.email.split("@")[0]}
            {isMe ? <span className="ml-2 text-[13px] font-normal text-muted">(você)</span> : null}
          </p>
          <p className="truncate text-[13.5px] text-muted">
            {profile.job_title ? `${profile.job_title}, ` : ""}
            {profile.email}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted sm:w-[300px] sm:flex-nowrap">
        <Badge tone={status.tone}>
          <StatusDot tone={status.tone} />
          {status.label}
        </Badge>
        {isMe || profile.status !== "active" ? <Badge tone="neutral">{ROLE_LABEL[profile.role]}</Badge> : null}
        <span className="whitespace-nowrap">desde {formatDate(profile.created_at)}</span>
      </div>

      <div className="flex flex-wrap gap-2 sm:w-[260px] sm:justify-end">
        {isMe ? null : profile.status === "pending" ? (
          <>
            <Button size="sm" onClick={() => run(profile, "approve")} loading={loading("approve")} disabled={disabled}>
              <Check className="size-4" aria-hidden />
              Aprovar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => ask({ profile, change: "block" })} disabled={disabled}>
              Recusar
            </Button>
          </>
        ) : profile.status === "blocked" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => run(profile, "approve")} loading={loading("approve")} disabled={disabled}>
              <UserRoundCheck className="size-4" aria-hidden />
              Reativar
            </Button>
            <Button size="sm" variant="danger" onClick={() => ask({ profile, change: "remove" })} disabled={disabled}>
              Remover
            </Button>
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`role-${profile.id}`}>
              Função de {profile.name || profile.email}
            </label>
            <Select
              id={`role-${profile.id}`}
              value={profile.role}
              disabled={disabled}
              className="h-8 w-[150px] text-[13px]"
              onChange={(e) => {
                const change = ROLE_CHANGE[e.target.value];
                if (profile.role === "admin") ask({ profile, change: "demote", to: change });
                else run(profile, change);
              }}
            >
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="writer">Redator</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => ask({ profile, change: "block" })} disabled={disabled}>
              Bloquear
            </Button>
            <Button size="sm" variant="danger" onClick={() => ask({ profile, change: "remove" })} disabled={disabled}>
              Remover
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function TeamList({ pending, members, meId }: { pending: Profile[]; members: Profile[]; meId: string }) {
  const [busy, setBusy] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [, startTransition] = useTransition();

  function run(profile: Profile, change: TeamChange | "remove") {
    setBusy({ id: profile.id, change: change === "remove" ? "block" : change });
    startTransition(async () => {
      const result = change === "remove" ? await removeTeamMember(profile.id) : await updateTeamMember(profile.id, change);
      setBusy(null);
      setConfirm(null);
      if (result.ok) toast.success(`${result.message}: ${profile.name || profile.email}`);
      else toast.error(result.error);
    });
  }

  const rowProps = { busy, run, ask: setConfirm };
  const who = confirm ? confirm.profile.name || confirm.profile.email : "";

  return (
    <div className="space-y-6">
      {pending.length ? (
        <Panel
          title={pending.length === 1 ? "1 conta aguardando aprovação" : `${pending.length} contas aguardando aprovação`}
          description="Aprove só quem você reconhece. Quem for recusado não consegue entrar."
        >
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <MemberRow key={p.id} profile={p} isMe={p.id === meId} {...rowProps} />
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Membros" description="Administradores gerenciam a equipe. Editores escrevem e publicam. Redatores escrevem e salvam; um editor publica.">
        {members.length ? (
          <ul className="divide-y divide-line">
            {members.map((p) => (
              <MemberRow key={p.id} profile={p} isMe={p.id === meId} {...rowProps} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Ninguém aprovado ainda.</p>
        )}
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.change === "demote") run(confirm.profile, confirm.to ?? "make_editor");
          else run(confirm.profile, confirm.change);
        }}
        pending={busy !== null}
        destructive={confirm?.change !== "demote"}
        title={
          confirm?.change === "demote"
            ? `Tirar ${who} da administração?`
            : confirm?.change === "remove"
              ? `Remover ${who} do CMS?`
              : confirm?.profile.status === "pending"
                ? `Recusar o pedido de ${who}?`
                : `Bloquear ${who}?`
        }
        confirmLabel={
          confirm?.change === "demote"
            ? "Confirmar mudança"
            : confirm?.change === "remove"
              ? "Remover pessoa"
              : confirm?.profile.status === "pending"
                ? "Recusar pedido"
                : "Bloquear conta"
        }
      >
        {confirm?.change === "demote" ? (
          <p>Esta pessoa deixa de aprovar contas e de gerenciar a equipe.</p>
        ) : confirm?.change === "remove" ? (
          <p>A conta é apagada e a pessoa perde o acesso na hora. Os artigos que ela escreveu continuam no CMS e nos sites. Para voltar, será preciso um convite novo.</p>
        ) : (
          <p>A conta perde o acesso ao CMS na hora. Os artigos que ela escreveu continuam no ar. Você pode reativar depois.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
