"use client";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import type { RevisionItem } from "./types";

export function HistorySection({
  revisions,
  restoringId,
  onRestore,
  saved,
}: {
  revisions: RevisionItem[];
  restoringId: string | null;
  onRestore: (revision: RevisionItem) => void;
  saved: boolean;
}) {
  if (!saved || revisions.length === 0) {
    return (
      <p className="text-sm text-muted">
        Uma versão é guardada a cada 10 minutos de edição e a cada publicação. Você pode voltar a qualquer uma delas.
      </p>
    );
  }
  return (
    <ol className="-my-1 divide-y divide-line">
      {revisions.map((rev, i) => (
        <li key={rev.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              <time dateTime={rev.createdAt}>
                {formatDateTime(rev.createdAt)}
              </time>
            </p>
            <p className="truncate text-[12.5px] text-muted">
              {rev.authorName ?? "Equipe"}
              {i === 0 ? ", versão mais recente" : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            loading={restoringId === rev.id}
            disabled={restoringId !== null}
            onClick={() => onRestore(rev)}
            aria-label={`Restaurar versão de ${formatDateTime(rev.createdAt)}`}
          >
            Restaurar
          </Button>
        </li>
      ))}
    </ol>
  );
}
