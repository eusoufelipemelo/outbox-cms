import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/panel";
import { BackLink } from "@/components/clients/bits";
import { ClientForm } from "@/components/clients/client-form";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requireUser();
  return (
    <div className="max-w-[820px]">
      <PageHeader
        back={<BackLink href="/clientes">Clientes e sites</BackLink>}
        title="Novo cliente"
        description="Comece pelo nome. Depois de salvar, você adiciona o site do cliente para publicar artigos nele."
      />
      <ClientForm />
    </div>
  );
}
