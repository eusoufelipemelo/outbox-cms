import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { getUser } from "@/lib/auth";
import { Button, buttonClass } from "@/components/ui/button";
import { EntryCard } from "../_components/entry-card";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Aguardando aprovação" };

export default async function PendingApprovalPage() {
  const user = await getUser().catch(() => null);
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/");
  if (user.status === "blocked") redirect("/login?erro=bloqueado");

  return (
    <EntryCard
      title="Sua conta está quase pronta"
      description={
        <>
          Você entrou como <strong className="font-semibold text-ink">{user.email}</strong>. Um administrador da OutBox
          precisa aprovar o acesso antes de você ver clientes e artigos.
        </>
      }
    >
      <div className="flex gap-3 rounded-[var(--radius-control)] border border-line bg-sunken p-4 text-[14.5px] leading-relaxed text-text">
        <Clock3 className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
        <p>
          Avise quem convidou você para o CMS. Quando a aprovação sair, é só abrir o painel de novo: não precisa criar outra
          conta.
        </p>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link href="/" className={buttonClass("primary", "lg", "h-11 justify-center")}>
          Verificar de novo
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="lg" className="h-11 w-full justify-center">
            Sair
          </Button>
        </form>
      </div>
    </EntryCard>
  );
}
