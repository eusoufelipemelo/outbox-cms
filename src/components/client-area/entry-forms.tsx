"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { PasswordInput, PasswordStrength } from "@/app/(entrada)/_components/password-input";
import { FormAlert } from "@/app/(entrada)/_components/form-alert";
import {
  clientRequestReset,
  clientResendConfirmation,
  clientSetPassword,
  clientSignIn,
  clientSignUp,
  type ClientFormState,
} from "@/lib/data/client-area-actions";
import { cn } from "@/lib/utils";

/** Título das telas de entrada + alternância Entrar / Criar conta. */
export function EntryHeading({ title, description, tab }: { title: string; description?: ReactNode; tab?: "entrar" | "cadastro" }) {
  return (
    <div className="mb-7">
      {tab ? (
        <nav aria-label="Entrar ou criar conta" className="mb-8 grid grid-cols-2 gap-1 rounded-[12px] border border-line bg-sunken p-1">
          {(
            [
              ["entrar", "/cliente/entrar", "Entrar"],
              ["cadastro", "/cliente/cadastro", "Primeiro acesso"],
            ] as const
          ).map(([id, href, label]) => (
            <Link
              key={id}
              href={href}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center rounded-[9px] text-[14.5px] transition-colors",
                tab === id ? "border border-line-strong bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "font-medium text-muted hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      <h1 className="display text-[30px] sm:text-[34px]">{title}</h1>
      {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

function CheckEmail({ email, children }: { email: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <MailCheck className="size-6 text-ink" aria-hidden />
      <p className="mt-3 text-[16px] font-semibold text-ink">Confira o seu e-mail</p>
      <p className="mt-1 text-[14.5px] leading-relaxed text-text">
        Enviamos um link para <strong className="font-semibold">{email}</strong>. Abra no mesmo aparelho em que você está agora. Se não chegar em
        alguns minutos, veja a caixa de spam.
      </p>
      {children}
    </div>
  );
}

function Resend({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(clientResendConfirmation, undefined);
  if (state?.sent) return <p className="mt-2 font-medium">Enviamos um novo link para {state.sent.email}.</p>;
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="email" value={email} />
      <button type="submit" disabled={pending} className="cursor-pointer font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60">
        {pending ? "Reenviando..." : "Reenviar o link de confirmação"}
      </button>
      {state?.error ? <p className="mt-1">{state.error}</p> : null}
    </form>
  );
}

export function SignInForm({ notice }: { notice?: string | null }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(clientSignIn, undefined);
  const e = state?.fieldErrors ?? {};
  const email = state?.values?.email ?? "";
  return (
    <form action={action} noValidate className="space-y-4">
      {notice && !state ? <FormAlert message={notice} tone="info" /> : null}
      <Field label="E-mail" htmlFor="email" error={e.email}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={email} placeholder="nome@suaempresa.com.br" className="h-12" />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Senha</Label>
          <Link href="/cliente/esqueci-senha" className="rounded text-[13.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" className="h-12" />
        {e.password ? (
          <p role="alert" className="text-[13px] text-danger">
            {e.password}
          </p>
        ) : null}
      </div>
      <FormAlert message={state?.error}>{state?.unconfirmed && email ? <Resend email={email} /> : null}</FormAlert>
      <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(clientSignUp, undefined);
  const [password, setPassword] = useState("");
  const e = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  if (state?.sent) {
    return (
      <CheckEmail email={state.sent.email}>
        <p className="mt-3 text-[14px] text-muted">Depois de confirmar, a OutBox libera o seu acesso aos artigos da sua empresa.</p>
      </CheckEmail>
    );
  }
  return (
    <form action={action} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seu nome" htmlFor="name" error={e.name}>
          <Input id="name" name="name" autoComplete="name" defaultValue={v.name} className="h-12" />
        </Field>
        <Field label="WhatsApp" htmlFor="phone" error={e.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(14) 99999-9999" defaultValue={v.phone} className="h-12" />
        </Field>
      </div>
      <Field label="Empresa" htmlFor="company" error={e.company} hint="Como a sua empresa é conhecida pelos clientes.">
        <Input id="company" name="company" autoComplete="organization" defaultValue={v.company} className="h-12" />
      </Field>
      <Field label="E-mail" htmlFor="email" error={e.email}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="nome@suaempresa.com.br" defaultValue={v.email} className="h-12" />
      </Field>
      <div className="space-y-1.5">
        <Label htmlFor="password">Crie uma senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          aria-describedby="password-strength"
          className="h-12"
        />
        {e.password ? (
          <p role="alert" className="text-[13px] text-danger">
            {e.password}
          </p>
        ) : (
          <PasswordStrength value={password} id="password-strength" />
        )}
      </div>
      <FormAlert message={state?.error} />
      <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
        {pending ? "Criando..." : "Criar meu acesso"}
      </Button>
      <p className="text-center text-[13px] text-muted">A OutBox confere o cadastro e libera os artigos da sua empresa.</p>
    </form>
  );
}

export function ResetRequestForm({ notice }: { notice?: string | null }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(clientRequestReset, undefined);
  if (state?.sent) return <CheckEmail email={state.sent.email} />;
  return (
    <form action={action} noValidate className="space-y-4">
      {notice && !state ? <FormAlert message={notice} /> : null}
      <Field label="E-mail da sua conta" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state?.values?.email} className="h-12" />
      </Field>
      <FormAlert message={state?.error} />
      <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
        Enviar link para criar senha nova
      </Button>
      <p className="text-center text-[14px]">
        <Link href="/cliente/entrar" className="font-medium text-muted hover:text-ink">
          Voltar para entrar
        </Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(clientSetPassword, undefined);
  const [password, setPassword] = useState("");
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha nova</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" value={password} onChange={(ev) => setPassword(ev.target.value)} className="h-12" />
        {e.password ? (
          <p role="alert" className="text-[13px] text-danger">
            {e.password}
          </p>
        ) : (
          <PasswordStrength value={password} id="password-strength" />
        )}
      </div>
      <Field label="Repita a senha nova" htmlFor="confirm" error={e.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" className="h-12" />
      </Field>
      <FormAlert message={state?.error} />
      <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
        Salvar e entrar
      </Button>
    </form>
  );
}
