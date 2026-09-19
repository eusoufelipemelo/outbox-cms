"use client";

import { useActionState, useEffect, useRef } from "react";
import { MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { inviteTeamMember, type InviteResult } from "@/lib/data/team-actions";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

export const ROLE_OPTIONS = [
  { value: "editor", label: "Editor", hint: "Escreve e publica artigos." },
  { value: "writer", label: "Redator", hint: "Escreve e salva; um editor revisa e publica." },
  { value: "admin", label: "Administrador", hint: "Tudo, inclusive a equipe." },
] as const;

export function TeamInvite() {
  const [state, action, pending] = useActionState<InviteResult | null, FormData>(inviteTeamMember, null);
  const formRef = useRef<HTMLFormElement>(null);
  const last = useRef<InviteResult | null>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success("Convite criado. Envie o link para a pessoa.");
      formRef.current?.reset();
    } else if (!state.fieldErrors) toast.error(state.error);
  }, [state]);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);
  const invite = state?.ok ? state.data : undefined;
  const message = invite
    ? `Olá, ${invite.name.split(" ")[0]}! Você foi convidado(a) para o OutBox CMS. Crie sua senha neste link (vale por 24 horas): ${invite.link}`
    : "";

  return (
    <Panel title="Convidar pessoa" description="A pessoa entra já aprovada, com a função escolhida. Ela recebe um link para criar a senha e depois completa o perfil.">
      <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
        <Field label="Nome" htmlFor="inv-name" error={err("name")}>
          <Input id="inv-name" name="name" required aria-invalid={Boolean(err("name"))} />
        </Field>
        <Field label="E-mail" htmlFor="inv-email" error={err("email")}>
          <Input id="inv-email" name="email" type="email" required autoComplete="off" aria-invalid={Boolean(err("email"))} />
        </Field>
        <Field label="Função" htmlFor="inv-role">
          <Select id="inv-role" name="role" defaultValue="editor">
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={pending} className="justify-center">
          <UserPlus className="size-4" aria-hidden />
          Gerar convite
        </Button>
      </form>

      {invite ? (
        <div className="mt-5 space-y-3 rounded-[var(--radius-control)] border border-ok/30 bg-ok-soft p-4">
          <p className="text-sm font-medium text-ink">
            Convite de {invite.name} ({invite.email}) pronto. Envie o link abaixo; ele vale por 24 horas.
          </p>
          <CopyField value={invite.link} label="Copiar link do convite" />
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            <MessageCircle className="size-4" aria-hidden />
            Enviar pelo WhatsApp
          </a>
        </div>
      ) : null}
      <p className="mt-4 text-[12.5px] text-muted">
        Funções: {ROLE_OPTIONS.map((r) => `${r.label}, ${r.hint.toLowerCase()}`).join(" ")}
      </p>
    </Panel>
  );
}
