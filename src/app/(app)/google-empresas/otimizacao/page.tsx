import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listChecklistClients } from "@/lib/data/gbp-checklist";
import { PageHeader } from "@/components/ui/panel";
import { ChecklistBoard } from "@/components/gbp/checklist-board";

export const metadata: Metadata = { title: "Otimização do Google Empresas" };

export default async function OtimizacaoPage() {
  await requireUser();
  const clients = await listChecklistClients();
  return (
    <>
      <PageHeader
        title="Otimização do Google Empresas"
        description="O roteiro para deixar o perfil do cliente completo, na ordem do trabalho. Marque cada item conforme for fazendo: o progresso fica salvo e qualquer pessoa da equipe continua de onde parou."
      />
      <ChecklistBoard clients={clients} />
    </>
  );
}
