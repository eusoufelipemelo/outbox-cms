import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/panel";
import { EmailForm, PasswordForm, ProfileForm } from "@/components/profile/profile-forms";

export const metadata: Metadata = { title: "Meu perfil" };

const ROLE_LABEL = { admin: "Administrador", editor: "Editor", writer: "Redator" } as const;

export default async function ProfilePage({ searchParams }: PageProps<"/perfil">) {
  const user = await requireUser();
  const { completar } = await searchParams;
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const providers = (data.user?.app_metadata?.providers as string[] | undefined) ?? [];

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Meu perfil" description={`Função: ${ROLE_LABEL[user.role]}. Só administradores mudam funções, em Equipe.`} />
      {!user.profileComplete || completar ? (
        <p role="status" className="mb-6 rounded-[var(--radius-panel)] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {user.profileComplete
            ? "Perfil completo. Pode voltar a usar o CMS normalmente."
            : "Complete seu perfil para começar a usar o CMS: nome, cargo, WhatsApp e foto são obrigatórios."}
        </p>
      ) : null}
      <div className="space-y-6">
        <ProfileForm
          initial={{
            name: user.name,
            jobTitle: user.jobTitle ?? "",
            phone: user.phone ?? "",
            bio: user.bio ?? "",
            avatarUrl: user.avatarUrl,
          }}
        />
        <EmailForm current={user.email} />
        <PasswordForm hasPassword={providers.includes("email")} />
      </div>
    </div>
  );
}
