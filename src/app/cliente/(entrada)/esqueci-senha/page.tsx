import type { Metadata } from "next";
import { noticeFor } from "@/lib/auth-errors";
import { EntryHeading, ResetRequestForm } from "@/components/client-area/entry-forms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ClientForgotPage({ searchParams }: PageProps<"/cliente/esqueci-senha">) {
  const { erro } = await searchParams;
  return (
    <div>
      <EntryHeading title="Criar senha nova" description="Informe o e-mail da sua conta. Enviamos um link para você escolher uma senha nova." />
      <ResetRequestForm notice={noticeFor(erro)} />
    </div>
  );
}
