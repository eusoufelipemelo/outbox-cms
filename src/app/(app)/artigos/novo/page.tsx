import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCategorySuggestions, listClientOptions, listDestinationSites } from "@/lib/data/posts";
import { ArticleEditor } from "@/components/editor/article-editor";
import { dateParamToLocalInput } from "@/components/editor/datetime";
import { isContentType } from "@/lib/geo";

export const metadata: Metadata = { title: "Novo artigo" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

/**
 * Não cria nada no GET (um prefetch de link geraria rascunhos vazios):
 * o artigo só nasce no primeiro salvamento, feito pelo próprio editor.
 *
 * Parâmetros aceitos:
 * - `?cliente=<id>` marca os sites ativos do cliente como destinos e pré-escolhe o cliente na IA;
 * - `?data=AAAA-MM-DD` sugere a data de publicação (agenda);
 * - `?tema=…&palavra=…&tipo=<content_type>` (Pautas) abre "Criar artigo completo com IA" preenchido;
 * - `?ia=1` abre o mesmo diálogo vazio.
 */
export default async function NewArticlePage({ searchParams }: PageProps<"/artigos/novo">) {
  await requireUser();
  const sp = await searchParams;
  const [sites, categories, clients] = await Promise.all([listDestinationSites(), listCategorySuggestions(), listClientOptions()]);
  const clienteRaw = first(sp.cliente);
  const clientId = GUID.test(clienteRaw) ? clienteRaw : "";
  const initialSiteIds = clientId ? sites.filter((s) => s.client.id === clientId && s.status === "active").map((s) => s.id) : [];

  const topic = first(sp.tema).slice(0, 300);
  const keyword = first(sp.palavra).slice(0, 120);
  const tipo = first(sp.tipo);
  const initialAi = {
    open: Boolean(topic) || first(sp.ia) === "1",
    topic,
    keyword,
    contentType: isContentType(tipo) ? tipo : undefined,
  };

  // chave nova a cada visita: "Novo artigo" depois de salvar outro sempre abre um editor limpo
  const key = crypto.randomUUID();
  return (
    <ArticleEditor
      key={key}
      post={null}
      sites={sites}
      categories={categories}
      clients={clients}
      initialScheduledLocal={dateParamToLocalInput(first(sp.data) || undefined)}
      initialSiteIds={initialSiteIds}
      initialClientId={clientId}
      initialAi={initialAi}
    />
  );
}
