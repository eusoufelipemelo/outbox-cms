import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listClientMap } from "@/lib/data/client-map";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { ClientsMap } from "@/components/clients/clients-map";

export const metadata: Metadata = { title: "Mapa de clientes" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function ClientsMapPage() {
  await requireUser();
  const clients = await listClientMap();
  const located = clients.filter((c) => c.uf);
  const clientCount = new Set(clients.map((c) => c.id)).size;
  const states = new Set(located.map((c) => c.uf)).size;
  const cities = new Set(located.map((c) => `${c.uf}:${(c.city ?? "").toLowerCase()}`)).size;

  return (
    <>
      <PageHeader
        title="Mapa de clientes"
        description={`${plural(clientCount, "cliente ativo", "clientes ativos")} em ${plural(states, "estado", "estados")} e ${plural(cities, "cidade", "cidades")}.`}
        actions={
          <Link href="/clientes/novo" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden />
            Novo cliente
          </Link>
        }
      />
      <ClientsMap clients={clients} />
    </>
  );
}
