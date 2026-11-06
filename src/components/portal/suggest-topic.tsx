"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { suggestTopicFromPortal } from "@/lib/data/portal-actions";

/** O cliente pede um artigo sobre um tema dele. */
export function SuggestTopic({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="mt-3 space-y-2 rounded-[var(--radius-panel)] border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await suggestTopicFromPortal(token, title, notes);
          setResult(r);
          if (r.ok) {
            setTitle("");
            setNotes("");
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor="tema" className="text-[14px] font-medium text-ink">
        Tema do artigo
      </label>
      <Input id="tema" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Quanto tempo leva a montagem de uma cozinha planejada" maxLength={200} />
      <Textarea
        rows={2}
        aria-label="O que não pode faltar (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="O que não pode faltar no artigo (opcional)"
      />
      {result ? <p className={result.ok ? "text-[13.5px] text-ok" : "text-[13.5px] text-danger"}>{result.message}</p> : null}
      <Button type="submit" loading={pending} disabled={title.trim().length < 5}>
        Enviar tema
      </Button>
    </form>
  );
}
