"use client";

import { CircleAlert, CircleCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeoReport } from "@/lib/geo";
import { cn } from "@/lib/utils";

export interface ExpertSuggestion {
  name: string;
  credentials: string | null;
  clientName: string;
}

export function GeoSection({
  report,
  authorName,
  expert,
  aiEnabled,
  onUseExpert,
}: {
  report: GeoReport;
  authorName: string;
  expert: ExpertSuggestion | null;
  aiEnabled: boolean | null;
  onUseExpert: (name: string) => void;
}) {
  const unmet = report.checks.filter((c) => !c.ok);
  const met = report.checks.filter((c) => c.ok);
  const pct = Math.round((report.score / report.total) * 100);
  const suggestExpert = expert && authorName.trim().toLowerCase() !== expert.name.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-snug text-muted">
        Prepara o artigo para ser citado por IAs como ChatGPT, Gemini, Perplexity e as respostas do Google.
      </p>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Checklist de GEO</p>
          <p className="text-sm font-semibold text-ink tabular-nums">
            {report.score} de {report.total}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="meter"
          aria-label="Pontuação de GEO"
          aria-valuemin={0}
          aria-valuemax={report.total}
          aria-valuenow={report.score}
          aria-valuetext={`${report.score} de ${report.total} itens atendidos`}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", pct >= 80 ? "bg-ok" : pct >= 50 ? "bg-warn" : "bg-danger")}
            style={{ width: `${pct}%` }}
          />
        </div>

        {unmet.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-ok">
            <CircleCheck className="size-4" aria-hidden /> Tudo certo. O artigo está pronto para ser citado.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {unmet.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px] leading-snug text-text">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>{c.hint}</span>
              </li>
            ))}
          </ul>
        )}

        {met.length > 0 && unmet.length > 0 ? (
          <details className="mt-3 text-[13px]">
            <summary className="inline-flex h-10 cursor-pointer items-center font-medium text-muted hover:text-ink">
              Ver {met.length} {met.length === 1 ? "item atendido" : "itens atendidos"}
            </summary>
            <ul className="mt-1 space-y-1.5">
              {met.map((c) => (
                <li key={c.id} className="flex gap-2 text-muted">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  {c.label}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {suggestExpert ? (
        <div className="rounded-[var(--radius-control)] border border-line bg-sunken px-3.5 py-3">
          <p className="flex gap-2 text-[13px] leading-snug text-text">
            <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="font-medium text-ink">{expert.name}</span>
              {expert.credentials ? `, ${expert.credentials}` : ""} é especialista de {expert.clientName}. Assinar com um especialista
              passa mais confiança para buscadores e IAs.
            </span>
          </p>
          <Button variant="secondary" className="mt-2.5 w-full justify-center" onClick={() => onUseExpert(expert.name)}>
            Usar {expert.name} como autor
          </Button>
        </div>
      ) : null}

      {unmet.some((c) => ["answer-length", "takeaways", "faq"].includes(c.id)) && aiEnabled ? (
        <p className="text-[12.5px] text-muted">
          Dica: em Assistente, use Gerar blocos de GEO para rascunhar resposta direta, pontos principais e perguntas frequentes a partir do
          texto.
        </p>
      ) : null}
    </div>
  );
}
