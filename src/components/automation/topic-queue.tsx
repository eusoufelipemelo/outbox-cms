"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { addClientTopics, removeClientTopic, writeTopicNow } from "@/lib/data/automation-actions";
import type { ClientTopic } from "@/lib/data/automations";
import { cn, formatDate } from "@/lib/utils";

export type TopicMode = "auto" | "client_first" | "client_only";

const MODES: { value: TopicMode; label: string; hint: string }[] = [
  { value: "auto", label: "A IA escolhe", hint: "A automação cria o tema de cada artigo sozinha." },
  { value: "client_first", label: "Temas do cliente primeiro", hint: "Usa a fila abaixo; quando acabar, a IA escolhe." },
  { value: "client_only", label: "Só temas do cliente", hint: "Escreve apenas a partir da fila. Fila vazia, pula a data." },
];

/** Fila de temas pedidos pelo cliente: a automação escreve a partir deles e manda para aprovação. */
export function TopicQueue({
  clientId,
  hasAutomation,
  topics,
  mode,
  onMode,
}: {
  clientId: string;
  hasAutomation: boolean;
  topics: ClientTopic[];
  mode: TopicMode;
  onMode: (m: TopicMode) => void;
}) {
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const queue = topics.filter((t) => t.status === "pending");
  const used = topics.filter((t) => t.status === "used").slice(-5).reverse();

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        after?.();
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  return (
    <section className="mt-5 rounded-[var(--radius-control)] border border-line p-4">
      <h3 className="text-sm font-semibold text-ink">Temas dos artigos</h3>
      <div className="mt-2 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="De onde vêm os temas">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={cn(
              "flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] border p-3",
              mode === m.value ? "border-ink bg-sunken" : "border-line-strong",
            )}
          >
            <input type="radio" name={`topic-mode-${clientId}`} value={m.value} checked={mode === m.value} onChange={() => onMode(m.value)} className="mt-1 accent-[var(--color-ink)]" />
            <span>
              <span className="block text-[14px] font-semibold text-ink">{m.label}</span>
              <span className="block text-[12.5px] text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-muted">A escolha vale depois de salvar a automação.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[13.5px] font-medium text-ink">
            Fila de temas do cliente <span className="font-normal text-muted tabular-nums">{queue.length}</span>
          </p>
          {queue.length ? (
            <ol className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line">
              {queue.map((t, i) => (
                <li key={t.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span className="mt-0.5 w-5 shrink-0 text-[12.5px] text-faint tabular-nums">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-ink">{t.title}</p>
                    {t.notes ? <p className="mt-0.5 text-[12.5px] text-muted">{t.notes}</p> : null}
                    <p className="mt-0.5 text-[12px] text-faint">
                      {t.source === "cliente" ? "Sugerido pelo cliente" : "Adicionado pela equipe"}, {formatDate(t.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending || !hasAutomation}
                      title={hasAutomation ? "Escrever agora e mandar para aprovação" : "Salve a automação antes"}
                      onClick={() => act(() => writeTopicNow(clientId, t.id))}
                    >
                      <PenLine className="size-3.5" aria-hidden />
                      Escrever agora
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} aria-label={`Remover ${t.title}`} onClick={() => act(() => removeClientTopic(t.id))}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-4 text-[13px] text-muted">
              Nenhum tema na fila. Adicione ao lado os temas que o cliente pediu, ou ele mesmo sugere pela área do cliente.
            </p>
          )}
          {used.length ? (
            <div className="mt-3">
              <p className="text-[12.5px] text-muted">Já escritos</p>
              <ul className="mt-1 space-y-1">
                {used.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[13px]">
                    <Badge tone="ok">Escrito</Badge>
                    {t.post_id ? (
                      <Link href={`/artigos/${t.post_id}`} className="truncate text-text underline-offset-2 hover:underline">
                        {t.title}
                      </Link>
                    ) : (
                      <span className="truncate text-text">{t.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor={`topics-${clientId}`} className="text-[13.5px] font-medium text-ink">
            Adicionar temas
          </label>
          <Textarea
            id={`topics-${clientId}`}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Um tema por linha. Ex.:\nComo escolher o puxador certo para a cozinha\nMDF ou MDP: qual dura mais no banheiro"}
          />
          <Textarea
            rows={2}
            aria-label="Orientação do cliente (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Orientação do cliente (opcional): o que não pode faltar, produto a citar, tom…"
          />
          <Button size="sm" loading={pending} disabled={!text.trim()} onClick={() => act(() => addClientTopics(clientId, text, notes), () => (setText(""), setNotes("")))}>
            <Plus className="size-3.5" aria-hidden />
            Adicionar à fila
          </Button>
        </div>
      </div>
    </section>
  );
}
