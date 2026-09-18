import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/data/clients";
import { PageHeader } from "@/components/ui/panel";
import { BackLink } from "@/components/clients/bits";
import { SiteForm } from "@/components/clients/site-form";

export const metadata: Metadata = { title: "Novo site" };

export default async function NewSitePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div className="max-w-[820px]">
      <PageHeader
        back={<BackLink href={`/clientes/${client.id}`}>{client.name}</BackLink>}
        title="Novo site"
        description={`Cadastre um site de ${client.name} para escolher ele como destino ao publicar artigos.`}
      />
      <SiteForm clientId={client.id} />
    </div>
  );
}
