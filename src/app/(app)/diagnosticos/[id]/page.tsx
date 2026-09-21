import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { aiStatus } from "@/lib/ai/server";
import { getDiagnostic } from "@/lib/data/diagnostics";
import { DiagnosticReport } from "@/components/diagnostics/report";
import { LiveProgress } from "@/components/diagnostics/live-progress";
import { ReportActions } from "@/components/diagnostics/report-actions";
import { hostname } from "@/lib/utils";

export const metadata: Metadata = { title: "Diagnóstico" };

export default async function DiagnosticoPage({ params }: PageProps<"/diagnosticos/[id]">) {
  await requireUser();
  const { id } = await params;
  const d = await getDiagnostic(id);
  if (!d) notFound();
  const shareUrl = `${env.appUrl}/relatorio/${d.share_token}`;

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/diagnosticos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Diagnósticos
        </Link>
        <ReportActions
          id={d.id}
          shareUrl={shareUrl}
          done={d.status === "done"}
          canUpgrade={d.status === "done" && d.report_source !== "ai" && aiStatus().enabled}
        />
      </div>

      {d.status === "running" ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
          <h1 className="display text-[clamp(1.75rem,3vw,2.375rem)]">Analisando {hostname(d.url)}</h1>
          <p className="mt-2 text-muted">Leva de 1 a 2 minutos. Esta tela atualiza sozinha.</p>
          <div className="mt-8">
            <LiveProgress step={d.step} />
          </div>
        </div>
      ) : d.status === "failed" ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
          <h1 className="display text-[clamp(1.75rem,3vw,2.375rem)]">O diagnóstico de {hostname(d.url)} não terminou</h1>
          <p className="mt-3 text-danger">{d.error}</p>
          <p className="mt-2 text-muted">Confira se o site abre normalmente e clique em Refazer.</p>
        </div>
      ) : (
        <>
          <p className="mb-6 text-[13px] text-muted print:hidden">
            {d.report_source === "ai" ? "Texto escrito pela IA." : "Texto padrão da OutBox (gratuito)."} Só a equipe vê este aviso.
          </p>
          {d.error ? (
            <p className="mb-6 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-warn print:hidden">{d.error}</p>
          ) : null}
          <DiagnosticReport d={d} />
        </>
      )}
    </div>
  );
}
