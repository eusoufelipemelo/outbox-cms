import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listServiceClients } from "@/lib/data/services";
import { PageHeader } from "@/components/ui/panel";
import { ServicesManager } from "@/components/services/services-manager";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicosPage() {
  await requireUser();
  const clients = await listServiceClients();
  const full = clients.filter((c) => c.blogGbp && c.instagram).length;
  return (
    <>
      <PageHeader
        title="Serviços"
        description={`O que cada cliente contratou. Blog e Google Empresas andam juntos; com Instagram, o artigo vira a base de tudo. ${full} cliente(s) no pacote completo.`}
      />
      <ServicesManager clients={clients} />
    </>
  );
}
