"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { approveArticle, rejectArticle, requestArticleChanges } from "@/lib/data/client-area-actions";

type Mode = "idle" | "confirm" | "changes" | "reject";

/**
 * Decisão sobre o artigo, presa ao pé da tela: aprovar e publicar (com confirmação),
 * pedir ajustes (recado obrigatório) ou recusar (motivo opcional).
 */
export function DecisionBar({ postId }: { postId: string }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const go = (next: Mode) => {
    setError(null);
    setText("");
    setMode(next);
  };

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setMode("idle");
      router.refresh();
    });

  return (
    <div
      role="region"
      aria-label="Sua decisão sobre o artigo"
      className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-20px_rgb(0_0_0/0.25)] backdrop-blur lg:bottom-0 lg:left-[272px]"
    >
      <div className="mx-auto w-full max-w-[760px] px-4 py-3 sm:px-6 sm:py-4">
        {error ? (
          <p role="alert" className="mb-2 text-[14px] text-danger">
            {error}
          </p>
        ) : null}

        {mode === "changes" || mode === "reject" ? (
          <div className="space-y-2.5">
            <label htmlFor="recado" className="block text-[15px] font-semibold text-ink">
              {mode === "changes" ? "O que você quer mudar?" : "Por que este artigo não serve? (opcional)"}
            </label>
            <Textarea
              id="recado"
              rows={3}
              autoFocus
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                mode === "changes"
                  ? "Ex.: trocar o título, citar o nosso prazo de entrega, tirar o terceiro parágrafo…"
                  : "Ex.: não trabalhamos com esse tipo de móvel, prefiro outro assunto…"
              }
            />
            <div className="flex gap-2">
              {mode === "changes" ? (
                <Button className="flex-1 justify-center" loading={pending} disabled={text.trim().length < 3} onClick={() => run(() => requestArticleChanges(postId, text))}>
                  Enviar pedido de ajustes
                </Button>
              ) : (
                <Button variant="danger" className="flex-1 justify-center" loading={pending} onClick={() => run(() => rejectArticle(postId, text))}>
                  Recusar artigo
                </Button>
              )}
              <Button variant="ghost" disabled={pending} onClick={() => go("idle")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : mode === "confirm" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 text-[15px] text-ink">O artigo vai para o seu site agora. Confirma?</p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="publish" size="lg" className="flex-1 justify-center" loading={pending} onClick={() => run(() => approveArticle(postId))}>
                <Check className="size-4" aria-hidden />
                Sim, publicar
              </Button>
              <Button variant="ghost" size="lg" disabled={pending} onClick={() => go("idle")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button variant="publish" size="lg" className="col-span-2 justify-center sm:flex-[2]" onClick={() => go("confirm")}>
              <Check className="size-[18px]" aria-hidden />
              Aprovar e publicar
            </Button>
            <Button variant="secondary" size="lg" className="justify-center sm:flex-1" onClick={() => go("changes")}>
              <PencilLine className="size-4" aria-hidden />
              Pedir ajustes
            </Button>
            <Button variant="ghost" size="lg" className="justify-center px-3 hover:text-danger" onClick={() => go("reject")}>
              <X className="size-4" aria-hidden />
              Recusar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
