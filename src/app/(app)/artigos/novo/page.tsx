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
  const { data } = await searchParams;
  const [sites, categories] = await Promise.all([listDestinationSites(), listCategorySuggestions()]);
  // chave nova a cada visita: "Novo artigo" depois de salvar outro sempre abre um editor limpo
  const key = crypto.randomUUID();
  return (
    <ArticleEditor
      key={key}
      post={null}
      sites={sites}
      categories={categories}
      initialScheduledLocal={dateParamToLocalInput(Array.isArray(data) ? data[0] : data)}
    />
  );
}
