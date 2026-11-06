import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { listClientAccess } from "@/lib/data/client-access";
import { clientAreaUrl } from "@/lib/approval/client-approval";
import { PageHeader } from "@/components/ui/panel";
import { ClientAccessManager } from "@/components/client-access/client-access-manager";

export const metadata: Metadata = { title: "Área do cliente" };

export default async function ClientAreaAdminPage() {
  await requireAdmin();
  const [{ accounts, invites }, companies] = await Promise.all([
    listClientAccess(),
    db().from("clients").select("id, name").neq("status", "archived").order("name"),
  ]);
  return (
    <>
      <PageHeader
        title="Área do cliente"
        description="Onde os seus clientes aprovam artigos, pedem ajustes e sugerem temas. Aqui você libera e bloqueia quem entra."
      />
      <ClientAccessManager
        url={clientAreaUrl()}
        accounts={accounts}
        invites={invites}
        companies={(companies.data ?? []) as { id: string; name: string }[]}
      />
    </>
  );
}
