import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/panel";
import { MediaLibrary } from "@/components/media/media-library";
import { isUuid, listClientsForMedia, listMedia } from "@/lib/data/media";

export const metadata: Metadata = { title: "Mídia" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const clientId = isUuid(sp.cliente) ? sp.cliente : null;
  const [initial, clients] = await Promise.all([listMedia({ q, clientId }), listClientsForMedia()]);

  return (
    <>
      <PageHeader
        title="Mídia"
        description="Imagens dos artigos de todos os clientes. Um bom texto alternativo ajuda no Google e em leitores de tela."
      />
      <MediaLibrary initial={initial} clients={clients} q={q} clientId={clientId} />
    </>
  );
}
