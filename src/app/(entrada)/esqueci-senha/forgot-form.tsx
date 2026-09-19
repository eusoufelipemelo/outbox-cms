"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { requestPasswordReset, type AuthFormState } from "../actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EntryCard } from "../_components/entry-card";
import { FormAlert } from "../_components/form-alert";

function BackToLogin() {
  return (
    <Link href="/login" className={buttonClass("ghost", "lg", "mt-3 h-11 w-full justify-center")}>
      <ArrowLeft className="size-4" aria-hidden />
      Voltar para entrar
    </Link>
  );
}

export function ForgotForm({ notice }: { notice: ReactNode }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, undefined);

  if (state?.sent) {
    return (
      <EntryCard title="Confira seu e-mail">
        <div aria-live="polite" className="flex gap-3 rounded-[var(--radius-control)] border border-line bg-sunken p-4 text-[14.5px] leading-relaxed text-text">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <p>
            Se existir uma conta com <strong className="font-semibold text-ink">{state.sent.email}</strong>, você vai receber
            um link para criar uma senha nova em alguns minutos. Abra o link neste navegador.
          </p>
        </div>
        <p className="mt-4 text-[14px] text-muted">Não chegou? Veja a caixa de spam ou peça de novo daqui a um minuto.</p>
        <BackToLogin />
      </EntryCard>
    );
  }

  const error = state?.fieldErrors?.email;
  return (
    <EntryCard
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta. Enviamos um link para você criar uma senha nova."
      notice={notice}
    >
      <form action={action} noValidate className="space-y-4">
        <Field label="E-mail" htmlFor="email" error={error}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@empresa.com.br"
            defaultValue={state?.values?.email ?? ""}
            required
            autoFocus
            aria-invalid={error ? true : undefined}
            className="h-11"
          />
        </Field>
        <FormAlert message={state?.error} />
        <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
          {pending ? "Enviando..." : "Enviar link"}
        </Button>
      </form>
      <BackToLogin />
    </EntryCard>
  );
}
