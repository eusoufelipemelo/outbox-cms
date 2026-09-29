"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Eye, EyeOff, ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { saveSettings, testText } from "@/lib/data/settings-actions";
import type { Group } from "@/lib/settings";

type Current = Record<
  string,
  { value: string; masked: boolean; fromEnv: boolean }
>;

export function SettingsForm({
  groups,
  current,
}: {
  groups: Group[];
  current: Current;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (key: string, v: string) =>
    setValues((s) => ({ ...s, [key]: v }));
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
      {groups.map((group) => {
        const filled = group.fields.filter(
          (f) =>
            (current[f.key]?.value ?? "") !== "" || current[f.key]?.fromEnv,
        ).length;
        const changed = group.fields.some((f) => values[f.key] !== undefined);
        return (
          <details
            key={group.id}
            className="group rounded-[var(--radius-panel)] border border-line bg-surface"
            open={changed || undefined}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  filled === 0
                    ? "bg-line-strong"
                    : filled === group.fields.length
                      ? "bg-ok"
                      : "bg-warn",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-ink">
                  {group.title}
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {group.description}
                </span>
              </span>
              <span className="hidden shrink-0 text-[12.5px] text-muted sm:inline">
                {filled} de {group.fields.length} preenchido(s)
              </span>
              {changed ? <Badge tone="warn">Alterado</Badge> : null}
              <ChevronDown
                className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="border-t border-line p-4 sm:p-5">
              {group.note ? (
                <p className="mb-4 text-[13px] text-warn">{group.note}</p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {group.fields.map((f) => {
                  const saved = current[f.key] ?? {
                    value: "",
                    masked: false,
                    fromEnv: false,
                  };
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
                        <Select
                          id={id}
                          value={typed ?? saved.value}
                          onChange={(e) => set(f.key, e.target.value)}
                        >
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
                            placeholder={
                              saved.masked ? saved.value : f.placeholder
                            }
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => set(f.key, e.target.value)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={
                              reveal[f.key]
                                ? "Esconder"
                                : "Mostrar o que você digitou"
                            }
                            onClick={() =>
                              setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))
                            }
                          >
                            {reveal[f.key] ? (
                              <EyeOff className="size-4" aria-hidden />
                            ) : (
                              <Eye className="size-4" aria-hidden />
                            )}
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={test}
                    disabled={pending}
                  >
                    <ServerCog className="size-3.5" aria-hidden />
                    Testar conexão de texto
                  </Button>
                  <span className="text-[13px] text-muted">
                    Faz um pedido curto ao modelo e mostra a resposta do
                    provedor.
                  </span>
                </div>
              ) : null}
            </div>
          </details>
        );
      })}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--shadow-pop)]">
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Salvar configurações
        </Button>
        {dirty ? (
          <Badge tone="warn">
            {Object.keys(values).length} campo(s) alterado(s)
          </Badge>
        ) : (
          <span className="text-[13px] text-muted">Nada alterado ainda.</span>
        )}
      </div>
    </div>
  );
}
