import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listTeam } from "@/lib/data/team";
import { PageHeader } from "@/components/ui/panel";
import { TeamList } from "@/components/team/team-list";
import { TeamInvite } from "@/components/team/team-invite";

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
        description="Convide pessoas, defina funções e remova acessos. Quem se cadastra sozinho fica aguardando aprovação."
      />
      <div className="space-y-6">
        <TeamInvite />
        <TeamList pending={pending} members={others} meId={me.id} />
      </div>
    </>
  );
}
