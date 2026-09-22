"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveFromCms } from "@/lib/data/automation-actions";
import { formatDateTime } from "@/lib/utils";
import type { RunItem } from "@/lib/data/automations";

const STATUS: Record<RunItem["status"], { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  running: { label: "Escrevendo", tone: "info" },
  awaiting: { label: "Com o cliente", tone: "warn" },
  approved: { label: "Aprovado", tone: "ok" },
  published: { label: "No ar", tone: "ok" },
  changes: { label: "Ajustes pedidos", tone: "danger" },
  failed: { label: "Falhou", tone: "danger" },
  manual: { label: "Rascunho", tone: "neutral" },
};

export function RunsList({ runs, appUrl }: { runs: RunItem[]; appUrl: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const publish = (id: string) =>
    start(async () => {
      const r = await approveFromCms(id);
      if (r.ok) {
        toast.success(r.message ?? "");
        router.refresh();
      } else toast.error(r.error);
    });

  if (!runs.length) return <p className="text-sm text-muted">Nenhuma execução ainda. Ligue a automação de um cliente ou use &ldquo;Rodar agora&rdquo;.</p>;

  return (
    <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
      {runs.map((r) => {
        const s = STATUS[r.status];
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-[13px] text-muted">{r.clientName}</span>
                <span className="text-[13px] text-faint">{formatDateTime(r.created_at)}</span>
              </div>
              <p className="mt-1 truncate text-[14.5px] font-medium text-ink">{r.postTitle ?? r.step ?? "Preparando…"}</p>
              {r.feedback ? <p className="mt-1 text-[13.5px] text-danger">Cliente pediu: {r.feedback}</p> : null}
              {r.error ? <p className="mt-1 text-[13px] text-muted">{r.error}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {r.post_id ? (
                <Link href={`/artigos/${r.post_id}`} className="text-sm text-muted hover:text-ink">
                  Abrir artigo
                </Link>
              ) : null}
              {r.post_id ? (
                <a href={`${appUrl}/previa/${r.approval_token}`} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-ink">
                  Prévia
                </a>
              ) : null}
              {r.post_id && r.status !== "published" ? (
                <Button variant="secondary" size="sm" onClick={() => publish(r.id)} disabled={pending}>
                  Publicar
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
