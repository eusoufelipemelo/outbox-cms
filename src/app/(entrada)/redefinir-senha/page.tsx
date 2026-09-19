import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Criar senha nova" };

// Só abre com a sessão criada pelo link de recuperação (vale para qualquer status de conta).
export default async function ResetPasswordPage() {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/esqueci-senha?erro=link-expirado");
  return <ResetForm email={data.user.email ?? ""} />;
}
