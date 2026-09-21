"use client";

import { useActionState } from "react";
import { createDiagnostic } from "@/lib/data/diagnostic-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ActionResult } from "@/lib/types";

export function NewDiagnosticForm({ aiEnabled }: { aiEnabled: boolean }) {
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
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink">Texto do relatório</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-line-strong p-3 has-[:checked]:border-ink has-[:checked]:bg-sunken">
            <input type="radio" name="ai" value="off" defaultChecked={!aiEnabled} className="mt-1 accent-[var(--color-ink)]" />
            <span>
              <span className="block text-[14.5px] font-semibold text-ink">Padrão, gratuito</span>
              <span className="block text-[13px] text-muted">Textos prontos da OutBox para cada problema encontrado. Fica pronto na hora.</span>
            </span>
          </label>
          <label className={`flex gap-3 rounded-[var(--radius-control)] border border-line-strong p-3 has-[:checked]:border-ink has-[:checked]:bg-sunken ${aiEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <input type="radio" name="ai" value="on" defaultChecked={aiEnabled} disabled={!aiEnabled} className="mt-1 accent-[var(--color-ink)]" />
            <span>
              <span className="block text-[14.5px] font-semibold text-ink">Escrito pela IA, cerca de R$ 0,40</span>
              <span className="block text-[13px] text-muted">
                {aiEnabled ? "Texto personalizado para o negócio do cliente, com o plano ligado aos problemas." : "Indisponível: configure ANTHROPIC_API_KEY."}
              </span>
            </span>
          </label>
        </div>
      </fieldset>
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
