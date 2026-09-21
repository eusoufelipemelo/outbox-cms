import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getDiagnosticByToken } from "@/lib/data/diagnostics";
import { DiagnosticReport } from "@/components/diagnostics/report";
import { PrintButton } from "@/components/diagnostics/report-actions";
import { hostname } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/relatorio/[token]">): Promise<Metadata> {
  const { token } = await params;
  const d = await getDiagnosticByToken(token);
  return {
    title: d ? `Diagnóstico ${d.business_name || hostname(d.url)}` : "Relatório",
    robots: { index: false, follow: false },
  };
}

/** Relatório público: aberto pelo link que o consultor envia ao cliente. */
export default async function RelatorioPage({ params }: PageProps<"/relatorio/[token]">) {
  const { token } = await params;
  const d = await getDiagnosticByToken(token);
  if (!d) notFound();

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-[1040px] px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={122} height={30} priority className="dark:hidden dark:print:block" />
          <Image src="/brand/logo-horizontal-branco.svg" alt="OutBox" width={122} height={30} priority className="hidden dark:block dark:print:hidden" />
          <PrintButton />
        </div>
        <DiagnosticReport d={d} />
      </div>
    </div>
  );
}
