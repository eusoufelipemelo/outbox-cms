"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/app/(entrada)/_components/password-input";
import { changeClientPassword, saveClientAccount, type ClientFormState } from "@/lib/data/client-area-actions";

function Saved({ state }: { state: ClientFormState }) {
  if (state?.ok) return <p role="status" className="text-[14px] font-medium text-ok">{state.ok}</p>;
  if (state?.error) return <p role="alert" className="text-[14px] text-danger">{state.error}</p>;
  return null;
}

export function AccountForm({ name, phone, email, company }: { name: string; phone: string; email: string; company: string }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClientAccount, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <Field label="Seu nome" htmlFor="name" error={e.name}>
        <Input id="name" name="name" defaultValue={state?.values?.name ?? name} autoComplete="name" className="h-11" />
      </Field>
      <Field label="WhatsApp" htmlFor="phone" error={e.phone} hint="A OutBox usa para avisar quando tiver artigo novo.">
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={state?.values?.phone ?? phone} autoComplete="tel" className="h-11" />
      </Field>
      <Field label="E-mail de acesso" htmlFor="email" hint="Para trocar o e-mail, fale com a OutBox.">
        <Input id="email" value={email} readOnly disabled className="h-11" />
      </Field>
      <Field label="Empresa" htmlFor="company">
        <Input id="company" value={company} readOnly disabled className="h-11" />
      </Field>
      <Saved state={state} />
      <Button type="submit" loading={pending}>
        Salvar dados
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(changeClientPassword, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <Field label="Senha atual" htmlFor="current" error={e.current}>
        <PasswordInput id="current" name="current" autoComplete="current-password" />
      </Field>
      <Field label="Nova senha" htmlFor="password" error={e.password} hint="Pelo menos 8 caracteres.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirm" error={e.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" />
      </Field>
      <Saved state={state} />
      <Button type="submit" variant="secondary" loading={pending}>
        Trocar senha
      </Button>
    </form>
  );
}
