"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { saveSettings, testText } from "@/lib/data/settings-actions";
import type { Group } from "@/lib/settings";

type Current = Record<string, { value: string; masked: boolean; fromEnv: boolean }>;

export function SettingsForm({ groups, current }: { groups: Group[]; current: Current }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));
  const dirty = Object.keys(values).length > 0;

  const save = () =>
    start(async () => {
      const r = await saveSettings(values);
      if (r.ok) {
        toast.success(r.message ?? "Salvo");
        setValues({});
        router.refresh();
      } else toast.error(r.error);
    });

  const test = () =>
    start(async () => {
      const r = await testText();
      if (r.ok) toast.success(r.message ?? "Conexão ok");
      else toast.error(r.error);
    });

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.id} className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
          <header className="mb-4">
            <h2 className="text-[16px] font-semibold text-ink">{group.title}</h2>
            <p className="mt-0.5 text-[13.5px] text-muted">{group.description}</p>
            {group.note ? <p className="mt-1 text-[13px] text-warn">{group.note}</p> : null}
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            {group.fields.map((f) => {
              const saved = current[f.key] ?? { value: "", masked: false, fromEnv: false };
              const typed = values[f.key];
              const id = `set-${f.key}`;
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  htmlFor={id}
                  hint={
                    saved.fromEnv
                      ? "Hoje vem das variáveis do servidor. Salvar aqui passa a valer."
                      : f.secret && saved.masked
                        ? `Guardada: ${saved.value}. Digite uma nova para trocar, ou "apagar" para remover.`
                        : f.hint
                  }
                >
                  {f.options ? (
                    <Select id={id} value={typed ?? saved.value} onChange={(e) => set(f.key, e.target.value)}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.secret ? (
                    <div className="flex gap-2">
                      <Input
                        id={id}
                        type={reveal[f.key] ? "text" : "password"}
                        value={typed ?? ""}
                        placeholder={saved.masked ? saved.value : f.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={reveal[f.key] ? "Esconder" : "Mostrar o que você digitou"}
                        onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                      >
                        {reveal[f.key] ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        id={id}
                        value={typed ?? saved.value}
                        placeholder={f.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        list={f.suggestions ? `${id}-lista` : undefined}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                      {f.suggestions ? (
                        <datalist id={`${id}-lista`}>
                          {f.suggestions.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      ) : null}
                    </>
                  )}
                </Field>
              );
            })}
          </div>

          {group.id === "texto" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button variant="secondary" size="sm" onClick={test} disabled={pending}>
                <ServerCog className="size-3.5" aria-hidden />
                Testar conexão de texto
              </Button>
              <span className="text-[13px] text-muted">Faz um pedido curto ao modelo e mostra a resposta do provedor.</span>
            </div>
          ) : null}
        </section>
      ))}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--shadow-pop)]">
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Salvar configurações
        </Button>
        {dirty ? <Badge tone="warn">{Object.keys(values).length} campo(s) alterado(s)</Badge> : <span className="text-[13px] text-muted">Nada alterado ainda.</span>}
      </div>
    </div>
  );
}
