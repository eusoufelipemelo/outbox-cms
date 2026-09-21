import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { listDiagnostics } from "@/lib/data/diagnostics";
import { scoreTone } from "@/lib/diagnostics/scoring";
import { PageHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { NewDiagnosticForm } from "@/components/diagnostics/new-diagnostic-form";
import { cn, formatDateTime, hostname } from "@/lib/utils";

export const metadata: Metadata = { title: "Diagnóstico" };

const toneText = { ok: "text-ok", warn: "text-warn", danger: "text-danger", neutral: "text-faint" } as const;

export default async function DiagnosticosPage() {
  await requireUser();
  const items = await listDiagnostics();
  const googleReady = Boolean(env.googleApiKey);

  return (
    <>
      <PageHeader
        title="Diagnóstico"
        description="Cole o site do cliente. O CMS mede a velocidade no Google, a estrutura de SEO, o preparo para IAs e o perfil no Google Empresas, e monta um relatório com plano de 6 a 12 meses para apresentar."
      />
      {!googleReady ? (
        <p className="mb-4 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-warn">
          Falta a chave GOOGLE_API_KEY no Easypanel. Sem ela o Google Empresas fica de fora e o PageSpeed pode recusar por limite de uso.
        </p>
      ) : null}
      <NewDiagnosticForm />

      <section className="mt-10">
        <h2 className="text-[17px] font-semibold text-ink">Histórico</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum diagnóstico ainda. O primeiro aparece aqui assim que você começar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {items.map((d) => {
              const overall = d.scores?.overall ?? null;
              return (
                <li key={d.id}>
                  <Link href={`/diagnosticos/${d.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken">
                    <span className={cn("w-12 text-right text-[22px] font-extrabold tabular-nums", toneText[scoreTone(overall)])}>
                      {d.status === "done" ? (overall ?? "—") : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{d.business_name || hostname(d.url)}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {hostname(d.url)}, {formatDateTime(d.created_at)}
                      </span>
                    </span>
                    {d.status === "running" ? <Badge tone="info">Analisando</Badge> : d.status === "failed" ? <Badge tone="danger">Falhou</Badge> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
