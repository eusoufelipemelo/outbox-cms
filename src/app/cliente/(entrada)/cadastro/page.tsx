import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getClientAccess } from "@/lib/client-auth";
import { EntryHeading, SignUpForm } from "@/components/client-area/entry-forms";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function ClientSignUpPage() {
  const access = await getClientAccess();
  if (access.state === "active") redirect("/cliente");
  if (access.state === "pending") redirect("/cliente/aguardando");
  if (access.state !== "anon") redirect("/cliente/entrar");
  return (
    <div>
      <EntryHeading tab="cadastro" title="Primeiro acesso" description="Crie o seu login para ler, aprovar e sugerir os artigos do site da sua empresa." />
      <SignUpForm />
    </div>
  );
}
