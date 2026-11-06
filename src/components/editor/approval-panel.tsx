"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareWarning, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { redoWithClientFeedback, sendToClient } from "@/lib/data/approval-actions";
import type { PostApproval } from "@/lib/data/approvals";
import { formatDateTime } from "@/lib/utils";

const KIND: Record<string, string> = { enviado: "Enviado para aprovação", ajustes: "Cliente pediu ajustes", aprovado: "Cliente aprovou", refeito: "Ajustado e reenviado" };
const BY: Record<string, string> = { cliente: "cliente", equipe: "equipe", automacao: "automação" };

/** Aprovação do cliente dentro do artigo: status, recado do cliente e as ações da equipe. */
export function ApprovalPanel({ postId, approval, published }: { postId: string; approval: PostApproval; published: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const client = approval.clientName ?? "o cliente";

  if (published && !approval.status) return null;

  const send = () =>
    start(async () => {
      const r = await sendToClient(postId);
      if (r.ok) {
        toast.success(r.message ?? "Enviado");
        router.refresh();
      } else toast.error(r.error);
    });

  const redo = () => {
    if (!confirm("A IA vai reescrever o texto com o pedido do cliente. Salve o que você editou antes: a página recarrega no fim. Continuar?")) return;
    start(async () => {
      const r = await redoWithClientFeedback(postId);
      if (r.ok) {
        toast.success(r.message ?? "Refeito");
        window.location.reload();
      } else toast.error(r.error);
    });
  };

  return (
    <section
      className={
        approval.status === "changes"
          ? "mb-5 rounded-[var(--radius-panel)] border border-warn/40 bg-warn-soft p-4 sm:p-5"
          : "mb-5 rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5"
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {approval.status === "changes" ? (
            <>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <MessageSquareWarning className="size-4 text-warn" aria-hidden />
                {approval.clientName ?? "O cliente"} pediu ajustes
              </p>
              <blockquote className="mt-2 border-l-2 border-warn pl-3 text-[14.5px] whitespace-pre-wrap text-text">
                {approval.feedback ?? "O cliente tocou em Pedir ajustes, mas ainda não escreveu o recado."}
              </blockquote>
            </>
          ) : approval.status === "awaiting" ? (
            <p className="text-[14.5px] text-text">
              <span className="font-semibold text-ink">Aguardando aprovação de {client}</span>
              {approval.requestedAt ? ` desde ${formatDateTime(approval.requestedAt)}` : ""}. O artigo está na área do cliente.
            </p>
          ) : approval.status === "approved" ? (
            <p className="text-[14.5px] text-ok">Aprovado por {client}.</p>
          ) : (
            <p className="text-[14.5px] text-text">
              Quer a aprovação do cliente antes de publicar? Envie o artigo para a área do cliente. Ele aprova e o artigo vai direto para o site.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {approval.status === "changes" ? (
            <>
              <Button variant="secondary" size="sm" loading={pending} disabled={!approval.feedback} onClick={redo}>
                <Sparkles className="size-3.5" aria-hidden />
                Refazer com a IA
              </Button>
              <Button size="sm" disabled={pending} onClick={send}>
                <Send className="size-3.5" aria-hidden />
                Reenviar para aprovação
              </Button>
            </>
          ) : approval.status === "awaiting" ? (
            <Button variant="ghost" size="sm" loading={pending} onClick={send}>
              Avisar o cliente de novo
            </Button>
          ) : approval.status !== "approved" && !published ? (
            <Button size="sm" loading={pending} onClick={send}>
              <Send className="size-3.5" aria-hidden />
              Enviar para o cliente aprovar
            </Button>
          ) : null}
        </div>
      </div>

      {approval.history.length ? (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-muted hover:text-ink">Histórico da aprovação ({approval.history.length})</summary>
          <ol className="mt-2 space-y-1.5">
            {[...approval.history].reverse().map((h, i) => (
              <li key={i} className="text-muted">
                <span className="text-text">{KIND[h.kind] ?? h.kind}</span> pela {BY[h.by] ?? h.by}, {formatDateTime(h.at)}
                {h.text ? <span className="mt-0.5 block whitespace-pre-wrap text-text">“{h.text}”</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
