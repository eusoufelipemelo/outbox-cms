"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { approveFromPortal, changesFromPortal } from "@/lib/data/portal-actions";

/** Barra fixa no rodapé: aprovar e publicar, ou pedir ajustes com um recado para a OutBox. */
export function PortalActions({ token, postId }: { token: string; postId: string }) {
  const [mode, setMode] = useState<"idle" | "confirm" | "changes">("idle");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setMode("idle");
        router.refresh();
      }
    });

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur" role="region" aria-label="Aprovação do artigo">
      <div className="mx-auto w-full max-w-[760px] px-4 py-3 sm:px-6">
        {result ? (
          <p role="status" className={result.ok ? "mb-2 text-[14px] font-medium text-ok" : "mb-2 text-[14px] text-danger"}>
            {result.message}
          </p>
        ) : null}

        {mode === "changes" ? (
          <div className="space-y-2">
            <label htmlFor="pedido" className="text-[14px] font-medium text-ink">
              O que você quer mudar?
            </label>
            <Textarea
              id="pedido"
              rows={3}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: trocar o segundo parágrafo, citar o nosso prazo de entrega, mudar o título…"
            />
            <div className="flex gap-2">
              <Button className="flex-1" loading={pending} disabled={text.trim().length < 3} onClick={() => run(() => changesFromPortal(token, postId, text))}>
                Enviar pedido de ajustes
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : mode === "confirm" ? (
          <div className="space-y-2">
            <p className="text-[14px] text-ink">O artigo vai para o seu site agora. Confirma?</p>
            <div className="flex gap-2">
              <Button variant="publish" className="flex-1" loading={pending} onClick={() => run(() => approveFromPortal(token, postId))}>
                <Check className="size-4" aria-hidden />
                Sim, publicar
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="publish" className="flex-1" onClick={() => setMode("confirm")} disabled={pending}>
              <Check className="size-4" aria-hidden />
              Aprovar e publicar
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setMode("changes")} disabled={pending}>
              <PencilLine className="size-4" aria-hidden />
              Pedir ajustes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
