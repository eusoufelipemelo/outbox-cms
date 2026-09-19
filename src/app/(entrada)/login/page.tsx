import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { noticeFor } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import { EntryCard, EntryFootnote } from "../_components/entry-card";
import { FormAlert } from "../_components/form-alert";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, erro } = await searchParams;
  const user = await getUser().catch(() => null);
  // Conta bloqueada fica aqui (com o aviso), sem voltar para "/" e entrar em laço.
  if (user?.status === "active") redirect("/");
  if (user?.status === "pending") redirect("/aguardando-aprovacao");

  const nextPath = safeNext(typeof next === "string" ? next : "/");
  const notice = noticeFor(erro);

  return (
    <>
      <EntryCard
        tab="login"
        next={nextPath}
        title="Entrar no CMS"
        description="Use sua conta Google ou o e-mail cadastrado."
        notice={notice ? <FormAlert message={notice} tone={erro === "confirmado-outro-navegador" ? "ok" : "danger"} /> : null}
      >
        <LoginForm next={nextPath} />
      </EntryCard>
      <EntryFootnote />
    </>
  );
}
