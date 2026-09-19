import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canPublish, requireUser } from "@/lib/auth";
import { getPostForEditor, listCategorySuggestions, listClientOptions, listDestinationSites } from "@/lib/data/posts";
import { ArticleEditor } from "@/components/editor/article-editor";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/artigos/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!GUID.test(id)) return { title: "Artigo" };
  const post = await getPostForEditor(id);
  return { title: post?.title || "Artigo sem título" };
}

export default async function EditArticlePage({ params }: PageProps<"/artigos/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!GUID.test(id)) notFound();
  const [post, sites, categories, clients] = await Promise.all([
    getPostForEditor(id),
    listDestinationSites(),
    listCategorySuggestions(),
    listClientOptions(),
  ]);
  if (!post) notFound();
  return <ArticleEditor key={post.id} canPublish={canPublish(user)} post={post} sites={sites} categories={categories} clients={clients} />;
}
