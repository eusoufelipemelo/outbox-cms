import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCategorySuggestions, listDestinationSites } from "@/lib/data/posts";
import { ArticleEditor } from "@/components/editor/article-editor";
import { dateParamToLocalInput } from "@/components/editor/datetime";

export const metadata: Metadata = { title: "Novo artigo" };

/**
 * Não cria nada no GET (um prefetch de link geraria rascunhos vazios):
 * o artigo só nasce no primeiro salvamento, feito pelo próprio editor.
 */
export default async function NewArticlePage({ searchParams }: PageProps<"/artigos/novo">) {
  await requireUser();
  const { data, cliente } = await searchParams;
  const [sites, categories] = await Promise.all([listDestinationSites(), listCategorySuggestions()]);
  // ?cliente=<id> (painel): já marca os sites ativos desse cliente como destinos
  const clientId = Array.isArray(cliente) ? cliente[0] : cliente;
  const initialSiteIds = clientId ? sites.filter((s) => s.client.id === clientId && s.status === "active").map((s) => s.id) : [];
  // chave nova a cada visita: "Novo artigo" depois de salvar outro sempre abre um editor limpo
  const key = crypto.randomUUID();
  return (
    <ArticleEditor
      key={key}
      post={null}
      sites={sites}
      categories={categories}
      initialScheduledLocal={dateParamToLocalInput(Array.isArray(data) ? data[0] : data)}
      initialSiteIds={initialSiteIds}
    />
  );
}
