"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { quickCreateClient } from "@/lib/data/quick-client-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ActionResult } from "@/lib/types";

export function QuickClientForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(quickCreateClient, null);

  useEffect(() => {
    if (state?.ok && state.data) {
      toast.success("Cliente cadastrado");
      router.push(`/clientes/${state.data.id}`);
    }
  }, [state, router]);

  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  return (
    <form action={action} className="space-y-5 rounded-[var(--radius-panel)] border border-line bg-surface p-6">
      <Field label="Nome do cliente" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" required autoFocus placeholder="Clínica Sorriso" aria-invalid={Boolean(err("name"))} />
      </Field>
      <Field
        label="Domínio do site"
        htmlFor="domain"
        error={err("domain")}
        hint="É por ele que o site do cliente recebe os artigos. Ex.: clinicasorriso.com.br"
      >
        <Input
          id="domain"
          name="domain"
          required
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="clinicasorriso.com.br"
          aria-invalid={Boolean(err("domain"))}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Segmento (opcional)" htmlFor="segment" hint="Ajuda a IA a escrever para o nicho certo.">
          <Input id="segment" name="segment" placeholder="Odontologia" />
        </Field>
        <Field label="Cidade (opcional)" htmlFor="city" hint="Para artigos com SEO local.">
          <Input id="city" name="city" placeholder="Curitiba" />
        </Field>
      </div>
      {state && !state.ok && !state.fieldErrors ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} className="w-full justify-center sm:w-auto">
        Cadastrar cliente
      </Button>
    </form>
  );
}
