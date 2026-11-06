import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getClientAccess } from "@/lib/client-auth";
import { noticeFor } from "@/lib/auth-errors";
import { clientSignOut } from "@/lib/data/client-area-actions";
import { EntryHeading, SignInForm } from "@/components/client-area/entry-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function ClientSignInPage({ searchParams }: PageProps<"/cliente/entrar">) {
  const { erro } = await searchParams;
  const access = await getClientAccess();
  if (access.state === "active") redirect("/cliente");
  if (access.state === "pending") redirect("/cliente/aguardando");

  if (access.state === "team" || access.state === "blocked") {
    return (
      <div>
        <EntryHeading
          title={access.state === "team" ? "Você está na conta da equipe" : "Acesso bloqueado"}
          description={
            access.state === "team"
              ? `Você entrou como ${access.email}, uma conta da equipe OutBox. A área do cliente usa um login próprio do cliente.`
              : "Este acesso foi bloqueado. Fale com a OutBox para liberar de novo."
          }
        />
        <div className="flex flex-wrap gap-2">
          {access.state === "team" ? (
            // recarga completa: o CMS aplica o tema (claro/escuro) da equipe no carregamento
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/" className="inline-flex h-11 items-center rounded-[var(--radius-control)] bg-ink px-4 text-[14.5px] font-medium text-on-ink hover:bg-ink-hover">
              Ir para o CMS
            </a>
          ) : null}
          <form action={clientSignOut}>
            <button type="submit" className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-control)] border border-line-strong px-4 text-[14.5px] font-medium text-ink hover:border-ink">
              Sair e entrar como cliente
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <EntryHeading tab="entrar" title="Entrar" description="Use o e-mail e a senha que você criou no primeiro acesso." />
      <SignInForm notice={noticeFor(erro)} />
    </div>
  );
}
