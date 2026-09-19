"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendConfirmation, signUp, type AuthFormState } from "../actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { EntryCard, Divider } from "../_components/entry-card";
import { GoogleButton } from "../_components/google-button";
import { PasswordInput, PasswordStrength } from "../_components/password-input";
import { FormAlert } from "../_components/form-alert";

function Sent({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resendConfirmation, undefined);
  return (
    <EntryCard
      title="Confirme seu e-mail"
      description={
        <>
          Enviamos um link de confirmação para <strong className="font-semibold text-ink">{email}</strong>. Abra o e-mail
          neste navegador e clique no link para ativar a conta.
        </>
      }
    >
      <div className="flex gap-3 rounded-[var(--radius-control)] border border-line bg-sunken p-4 text-[14px] leading-relaxed text-text">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
        <p>Depois da confirmação, um administrador da OutBox libera seu acesso ao painel.</p>
      </div>

      <form action={action} className="mt-5">
        <input type="hidden" name="email" value={email} />
        <p className="text-[14px] text-muted">Não chegou em alguns minutos? Veja a caixa de spam ou peça outro link.</p>
        <Button type="submit" variant="secondary" size="lg" loading={pending} className="mt-3 h-11 w-full justify-center">
          Reenviar link de confirmação
        </Button>
        <FormAlert
          className="mt-3"
          tone={state?.error ? "danger" : "ok"}
          message={state?.error ?? (state?.sent ? `Enviamos um novo link para ${state.sent.email}.` : undefined)}
        />
      </form>

      <Link href="/login" className={buttonClass("ghost", "lg", "mt-2 h-11 w-full justify-center")}>
        Voltar para entrar
      </Link>
    </EntryCard>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, undefined);
  const [password, setPassword] = useState("");
  const errors = state?.fieldErrors ?? {};

  if (state?.sent) return <Sent email={state.sent.email} />;

  return (
    <EntryCard tab="cadastro" next={next} title="Crie seu acesso" description="Use sua conta Google ou qualquer e-mail.">
      <GoogleButton next={next} />
      <Divider>ou com e-mail</Divider>

      <form action={action} noValidate className="space-y-4" onSubmit={() => setPassword("")}>
        <Field label="Nome" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Como a equipe chama você"
            defaultValue={state?.values?.name ?? ""}
            required
            maxLength={80}
            aria-invalid={errors.name ? true : undefined}
            className="h-11"
          />
        </Field>
        <Field label="E-mail" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@empresa.com.br"
            defaultValue={state?.values?.email ?? ""}
            required
            aria-invalid={errors.email ? true : undefined}
            className="h-11"
          />
        </Field>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby="password-hint"
          />
          {errors.password ? (
            <p id="password-hint" role="alert" className="text-[13px] text-danger">
              {errors.password}
            </p>
          ) : (
            <PasswordStrength value={password} id="password-hint" />
          )}
        </div>

        <FormAlert message={state?.error} />

        <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
          {pending ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[14px] text-muted">
        Já tem conta?{" "}
        <Link href={next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="rounded font-semibold text-ink underline underline-offset-2 hover:no-underline">
          Entrar
        </Link>
      </p>
    </EntryCard>
  );
}
