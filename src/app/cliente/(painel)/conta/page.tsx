import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireClient } from "@/lib/client-auth";
import { clientSignOut } from "@/lib/data/client-area-actions";
import { ClientPageHeader } from "@/components/client-area/shell";
import { AccountForm, PasswordForm } from "@/components/client-area/account-forms";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const { account, company } = await requireClient();
  return (
    <div className="max-w-[880px]">
      <ClientPageHeader title="Minha conta" description="Seus dados de acesso à área do cliente." />
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="dados" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          <h2 id="dados" className="mb-4 text-[17px] font-bold text-ink">
            Seus dados
          </h2>
          <AccountForm name={account.name} phone={account.phone ?? ""} email={account.email} company={company.name} />
        </section>
        <div className="space-y-6">
          <section aria-labelledby="senha" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
            <h2 id="senha" className="mb-4 text-[17px] font-bold text-ink">
              Senha
            </h2>
            <PasswordForm />
          </section>
          <form action={clientSignOut}>
            <button
              type="submit"
              className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-[14.5px] font-medium text-ink transition-colors hover:border-ink"
            >
              <LogOut className="size-4" aria-hidden />
              Sair da área do cliente
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
