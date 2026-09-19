"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendConfirmation, signIn, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { GoogleButton } from "../_components/google-button";
import { PasswordInput } from "../_components/password-input";
import { FormAlert } from "../_components/form-alert";
import { Divider } from "../_components/entry-card";

function ResendConfirmation({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resendConfirmation, undefined);
  if (state?.sent) {
    return <p className="mt-2 font-medium">Enviamos um novo link para {state.sent.email}. Veja também a caixa de spam.</p>;
  }
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer font-semibold underline underline-offset-2 hover:no-underline disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Reenviando..." : "Reenviar confirmação"}
      </button>
      {state?.error ? <p className="mt-1">{state.error}</p> : null}
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, undefined);
  const email = state?.values?.email ?? "";
  const errors = state?.fieldErrors ?? {};

  return (
    <div>
      <GoogleButton next={next} />
      <Divider>ou com e-mail</Divider>

      <form action={action} noValidate className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="E-mail" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@empresa.com.br"
            defaultValue={email}
            required
            aria-invalid={errors.email ? true : undefined}
            className="h-11"
          />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Senha</Label>
            <Link
              href="/esqueci-senha"
              className="rounded text-[13.5px] font-medium text-brand-ink underline-offset-2 hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password ? (
            <p id="password-error" role="alert" className="text-[13px] text-danger">
              {errors.password}
            </p>
          ) : null}
        </div>

        <FormAlert message={state?.error}>
          {state?.unconfirmed && email ? <ResendConfirmation email={email} /> : null}
        </FormAlert>

        <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[14px] text-muted">
        Ainda não tem conta?{" "}
        <Link href={next !== "/" ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"} className="rounded font-semibold text-ink underline underline-offset-2 hover:no-underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
