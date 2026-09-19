import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/server";
import { listClientOptions } from "@/lib/data/clients";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { IdeasBoard } from "@/components/pautas/ideas-board";

export const metadata: Metadata = { title: "Pautas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PautasPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const requested = Array.isArray(sp.cliente) ? sp.cliente[0] : sp.cliente;
  const clients = await listClientOptions();
  const ai = aiStatus();

  const header = (
    <PageHeader
      title="Pautas"
      description="Ideias de artigos para cada cliente, pensadas para aparecer no Google e nas respostas de IAs. Escolha uma e a IA escreve o artigo completo."
    />
  );

  if (clients.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<Lightbulb className="size-7" aria-hidden />}
          title="Cadastre um cliente para gerar pautas"
          description="As pautas partem do segmento, dos serviços, da cidade e das palavras-chave de cada cliente."
          action={
            <Link href="/clientes/novo" className={buttonClass("primary")}>
              Cadastrar cliente
            </Link>
          }
        />
      </>
    );
  }

  const initialClientId =
    requested && clients.some((c) => c.id === requested) ? requested : clients.length === 1 ? clients[0].id : "";

  return (
    <>
      {header}
      <IdeasBoard clients={clients} initialClientId={initialClientId} aiEnabled={ai.enabled} />
    </>
  );
}
