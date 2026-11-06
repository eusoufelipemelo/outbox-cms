"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { removeTopic, suggestTopic } from "@/lib/data/client-area-actions";

/** Novo tema: uma frase com o assunto e, se quiser, o que não pode faltar no artigo. */
export function TopicForm() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await suggestTopic(title, notes);
      setResult(r);
      if (r.ok) {
        setTitle("");
        setNotes("");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
      <Field label="Tema do artigo" htmlFor="tema" hint="Escreva como você explicaria para um cliente. Ex.: quanto tempo dura um armário de MDF.">
        <Input id="tema" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11" required />
      </Field>
      <Field label="O que não pode faltar (opcional)" htmlFor="orientacao" hint="Dados, exemplos, serviços ou cidades que o artigo deve citar.">
        <Textarea id="orientacao" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} />
      </Field>
      {result ? (
        <p role="status" className={result.ok ? "text-[14px] font-medium text-ok" : "text-[14px] text-danger"}>
          {result.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} disabled={title.trim().length < 5} className="w-full justify-center sm:w-auto">
        <Send className="size-4" aria-hidden />
        Enviar tema
      </Button>
    </form>
  );
}

export function RemoveTopicButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Tirar da fila: ${title}`}
      title="Tirar da fila"
      onClick={() => {
        if (!confirm("Tirar este tema da fila?")) return;
        start(async () => {
          const r = await removeTopic(id);
          if (r.ok) router.refresh();
          else alert(r.message);
        });
      }}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors hover:bg-sunken hover:text-danger disabled:opacity-50"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
