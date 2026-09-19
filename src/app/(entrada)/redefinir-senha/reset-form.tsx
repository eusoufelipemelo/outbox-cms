"use client";

import { useActionState, useState } from "react";
import { updatePassword, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { EntryCard } from "../_components/entry-card";
import { PasswordInput, PasswordStrength } from "../_components/password-input";
import { FormAlert } from "../_components/form-alert";

export function ResetForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, undefined);
  const [password, setPassword] = useState("");
  const errors = state?.fieldErrors ?? {};

  return (
    <EntryCard
      title="Criar senha nova"
      description={
        email ? (
          <>
            Para a conta <strong className="font-semibold text-ink">{email}</strong>. Depois de salvar, você entra direto no painel.
          </>
        ) : (
          "Depois de salvar, você entra direto no painel."
        )
      }
    >
      <form action={action} noValidate className="space-y-4" onSubmit={() => setPassword("")}>
        {/* ajuda gerenciadores de senha a associar a conta */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha nova</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            autoFocus
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
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Repita a senha nova</Label>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            required
            maxLength={72}
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby={errors.confirm ? "confirm-error" : undefined}
          />
          {errors.confirm ? (
            <p id="confirm-error" role="alert" className="text-[13px] text-danger">
              {errors.confirm}
            </p>
          ) : null}
        </div>
        <FormAlert message={state?.error} />
        <Button type="submit" size="lg" loading={pending} className="h-12 w-full justify-center">
          {pending ? "Salvando..." : "Salvar senha nova"}
        </Button>
      </form>
    </EntryCard>
  );
}
