import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/panel";
import { BackLink } from "@/components/clients/bits";
import { QuickClientForm } from "@/components/clients/quick-client-form";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requireUser();
  return (
    <div className="max-w-[640px]">
      <PageHeader
        back={<BackLink href="/clientes">Clientes e sites</BackLink>}
        title="Novo cliente"
        description="Nome e domínio bastam. O site do cliente passa a receber os artigos assim que estiver no ar com o blog OutBox."
      />
      <QuickClientForm />
    </div>
  );
}
