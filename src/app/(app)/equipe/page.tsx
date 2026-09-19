import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listTeam } from "@/lib/data/team";
import { PageHeader } from "@/components/ui/panel";
import { TeamList } from "@/components/team/team-list";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const team = await listTeam();
  const pending = team.filter((p) => p.status === "pending");
  const others = team.filter((p) => p.status !== "pending");

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem pode entrar no CMS. Contas novas, com Google ou e-mail, ficam aguardando até um administrador aprovar."
      />
      <TeamList pending={pending} members={others} meId={me.id} />
    </>
  );
}
