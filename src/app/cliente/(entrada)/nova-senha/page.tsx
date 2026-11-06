import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { EntryHeading, NewPasswordForm } from "@/components/client-area/entry-forms";

export const metadata: Metadata = { title: "Senha nova" };

// Só abre com a sessão criada pelo link de recuperação.
export default async function ClientNewPasswordPage() {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/cliente/esqueci-senha?erro=link-expirado");
  return (
    <div>
      <EntryHeading title="Escolha a senha nova" description={`Para a conta ${data.user.email ?? ""}.`} />
      <NewPasswordForm />
    </div>
  );
}
