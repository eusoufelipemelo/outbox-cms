import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getDiagnosticByToken } from "@/lib/data/diagnostics";
import { DiagnosticReport } from "@/components/diagnostics/report";
import { PrintButton } from "@/components/diagnostics/report-actions";
import { hostname } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/relatorio/[token]">): Promise<Metadata> {
  const { token } = await params;
  const d = await getDiagnosticByToken(token);
  if (!d) return { title: "Relatório", robots: { index: false, follow: false } };
  const name = d.business_name || d.business?.name || hostname(d.url);
  const overall = d.scores?.overall;
  const title = `Diagnóstico digital de ${name}`;
  const description = `${overall != null ? `Nota ${overall} de 100. ` : ""}Onde ${name} perde clientes no Google, no Google Maps e nas IAs, e o plano da OutBox para 6 a 12 meses.`;
  return {
    metadataBase: new URL(env.appUrl),
    title: { absolute: `${title} | OutBox` },
    description,
    robots: { index: false, follow: false },
    // a imagem vem do opengraph-image.tsx desta rota
    openGraph: { type: "website", siteName: "OutBox", locale: "pt_BR", title, description, url: `/relatorio/${token}` },
    twitter: { card: "summary_large_image", title, description },
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
