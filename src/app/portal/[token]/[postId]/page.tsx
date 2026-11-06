import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getPortalClient, getPortalPost } from "@/lib/data/portal";
import { PortalShell } from "@/components/portal/portal-shell";
import { ArticleView } from "@/components/portal/article-view";
import { PortalActions } from "@/components/portal/portal-actions";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/portal/[token]/[postId]">): Promise<Metadata> {
  const { token, postId } = await params;
  const client = await getPortalClient(token);
  const post = client ? await getPortalPost(client.id, postId) : null;
  return { title: post ? `${post.title} · Área do cliente` : "Área do cliente", robots: { index: false, follow: false } };
}

export default async function PortalPostPage({ params }: PageProps<"/portal/[token]/[postId]">) {
  const { token, postId } = await params;
  const client = await getPortalClient(token);
  if (!client) notFound();
  const post = await getPortalPost(client.id, postId);
  if (!post) notFound();

  const live = post.status === "published";
  const state = live ? "published" : post.approval_status === "changes" ? "changes" : post.approval_status === "awaiting" ? "awaiting" : "other";

  return (
    <PortalShell>
      <Link href={`/portal/${token}`} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Todos os artigos
      </Link>

      <div className="mt-5 mb-6 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-[14px]">
        {state === "awaiting" ? (
          <p className="text-text">Leia o artigo até o fim. Os botões para aprovar ou pedir ajustes ficam na parte de baixo da tela.</p>
        ) : state === "changes" ? (
          <p className="text-text">
            <span className="font-semibold text-ink">A OutBox está ajustando este artigo.</span>
            {post.approval_feedback ? ` Você pediu: ${post.approval_feedback}` : ""}
          </p>
        ) : state === "published" ? (
          <p className="flex flex-wrap items-center gap-x-2 text-text">
            <span className="font-semibold text-ink">Este artigo já está no seu site.</span>
            {post.url ? (
              <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink">
                Abrir no site
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </p>
        ) : (
          <p className="text-text">Este artigo ainda está com a equipe da OutBox.</p>
        )}
      </div>

      <h1 className="display text-[clamp(1.8rem,5vw,2.5rem)] leading-[1.08]">{post.title}</h1>
      <p className="mt-3 mb-8 text-[14px] text-muted">
        {post.author_name ? `${post.author_name}, ` : ""}
        {formatDate(post.created_at)}
        {post.reading_minutes ? `, ${post.reading_minutes} min de leitura` : ""}
      </p>
      <ArticleView post={post} />

      {state === "awaiting" ? <PortalActions token={token} postId={post.id} /> : null}
    </PortalShell>
  );
}
