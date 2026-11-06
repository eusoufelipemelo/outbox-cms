import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRunByToken } from "@/lib/data/automations";
import { formatDate } from "@/lib/utils";
import { ArticleView } from "@/components/portal/article-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/previa/[token]">): Promise<Metadata> {
  const { token } = await params;
  const data = await getRunByToken(token);
  return {
    title: data ? `${data.post.title} (rascunho)` : "Rascunho",
    description: data?.post.excerpt ?? undefined,
    robots: { index: false, follow: false },
  };
}

/** Prévia do rascunho que o cliente abre pelo link do Telegram. */
export default async function PreviaPage({ params }: PageProps<"/previa/[token]">) {
  const { token } = await params;
  const data = await getRunByToken(token);
  if (!data) notFound();
  const { post, run, clientName } = data;

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6">
        <header className="mb-8 border-b border-line pb-6">
          <p className="text-[13px] text-muted">
            Rascunho para {clientName ?? "sua empresa"}
            {run.status === "published" ? ", já publicado" : ", aguardando sua aprovação"}
          </p>
          <h1 className="display mt-2 text-[clamp(1.8rem,4vw,2.6rem)]">{post.title}</h1>
          <p className="mt-3 text-[15px] text-muted">
            {post.author_name ? `${post.author_name}, ` : ""}
            {formatDate(post.created_at)}
            {post.reading_minutes ? `, ${post.reading_minutes} min de leitura` : ""}
          </p>
        </header>

        <ArticleView post={post} />

        <footer className="mt-10 border-t border-line pt-6 text-[13.5px] text-muted">
          Para aprovar ou pedir ajustes, volte à conversa do Telegram. Conteúdo produzido pela OutBox.
        </footer>
      </div>
    </div>
  );
}
