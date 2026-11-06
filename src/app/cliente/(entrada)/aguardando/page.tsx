import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { getClientAccess } from "@/lib/client-auth";
import { clientSignOut } from "@/lib/data/client-area-actions";
import { EntryHeading } from "@/components/client-area/entry-forms";

export const metadata: Metadata = { title: "Cadastro recebido" };

export default async function ClientPendingPage() {
  const access = await getClientAccess();
  if (access.state === "active") redirect("/cliente");
  if (access.state !== "pending") redirect("/cliente/entrar");
  const { account } = access;
  const first = account.name.split(" ")[0];
  return (
    <div>
      <EntryHeading
        title={`Cadastro recebido, ${first}`}
        description={
          <>
            A OutBox confere os seus dados e liga o seu acesso aos artigos da sua empresa. Isso
            costuma levar poucas horas em dia útil.
          </>
        }
      />
      <div className="flex gap-3 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-[14.5px] leading-relaxed text-text">
        <Clock3 className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
        <p>
          Quando estiver liberado, é só entrar de novo por aqui com <strong className="font-semibold">{account.email}</strong>. Você vai ver os artigos
          esperando a sua aprovação e poderá sugerir temas.
        </p>
      </div>
      <form action={clientSignOut} className="mt-6">
        <button type="submit" className="cursor-pointer text-[14px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}
