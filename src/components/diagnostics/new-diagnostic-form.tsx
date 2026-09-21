"use client";

import { useActionState } from "react";
import { createDiagnostic } from "@/lib/data/diagnostic-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ActionResult } from "@/lib/types";

export function NewDiagnosticForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createDiagnostic, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return (
    <form action={action} className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
      <Field label="Site do cliente" htmlFor="url" error={err("url")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="url"
            name="url"
            required
            autoFocus
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="clinicaexemplo.com.br"
            aria-invalid={Boolean(err("url"))}
            className="h-12 text-base"
          />
          <Button type="submit" size="lg" loading={pending} className="justify-center">
            Fazer diagnóstico
          </Button>
        </div>
      </Field>
      <details className="group mt-4">
        <summary className="cursor-pointer text-sm text-muted hover:text-ink">
          Ajudar a achar o perfil no Google Empresas (opcional)
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa no Google" htmlFor="business_name" hint="Como aparece no Google Maps.">
            <Input id="business_name" name="business_name" placeholder="Clínica Exemplo" />
          </Field>
          <Field label="Cidade" htmlFor="city">
            <Input id="city" name="city" placeholder="Brasília" />
          </Field>
        </div>
      </details>
      {state && !state.ok && !state.fieldErrors ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <p className="mt-4 text-[13px] text-faint">Leva de 1 a 2 minutos. Você pode sair da tela: o resultado fica salvo no histórico.</p>
    </form>
  );
}
