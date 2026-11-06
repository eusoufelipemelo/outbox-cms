import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CircleCheckBig, Clock3, ThumbsDown } from "lucide-react";
import { requireClient } from "@/lib/client-auth";
import { getPortalPost } from "@/lib/data/client-area";
import { ArticleView } from "@/components/portal/article-view";
import { DecisionBar } from "@/components/client-area/decision-bar";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Artigo" };

function Notice({ tone, icon, title, children }: { tone: "warn" | "ok" | "neutral"; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  const cls = tone === "warn" ? "border-warn/40 bg-warn-soft" : tone === "ok" ? "border-ok/30 bg-ok-soft" : "border-line bg-surface";
  return (
    <div className={`mb-8 flex gap-3 rounded-[var(--radius-panel)] border p-4 sm:p-5 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-[14.5px] text-text">
        <p className="font-semibold text-ink">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default async function ClientArticlePage({ params }: PageProps<"/cliente/artigos/[id]">) {
  const { id } = await params;
  const { company } = await requireClient();
  const post = await getPortalPost(company.id, id);
  if (!post) notFound();

  const published = post.status === "published";
  const deciding = !published && post.approval_status === "awaiting";

  return (
    <div className={deciding ? "pb-40 sm:pb-28" : ""}>
      <Link href="/cliente/aprovar" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Voltar
      </Link>

      <div className="mx-auto mt-6 max-w-[720px]">
        {published ? (
          <Notice tone="ok" icon={<CircleCheckBig className="size-5 text-ok" aria-hidden />} title="Este artigo está no ar no seu site">
            {post.url ? (
              <a href={post.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4 hover:no-underline">
                Abrir no site
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            ) : (
              <p className="mt-1">Ele já foi enviado para o seu site.</p>
            )}
          </Notice>
        ) : post.approval_status === "changes" ? (
          <Notice tone="warn" icon={<Clock3 className="size-5 text-warn" aria-hidden />} title="A OutBox está ajustando com o seu pedido">
            {post.approval_feedback ? <p className="mt-1 whitespace-pre-wrap">“{post.approval_feedback}”</p> : null}
            <p className="mt-1 text-muted">Quando ficar pronto, ele volta para você aprovar.</p>
          </Notice>
        ) : post.approval_status === "rejected" ? (
          <Notice tone="neutral" icon={<ThumbsDown className="size-5 text-muted" aria-hidden />} title="Você recusou este artigo">
            <p className="mt-1 text-muted">Ele não vai para o seu site.{post.approval_feedback ? ` Motivo: “${post.approval_feedback}”` : ""}</p>
          </Notice>
        ) : post.approval_status === "approved" ? (
          <Notice tone="ok" icon={<CircleCheckBig className="size-5 text-ok" aria-hidden />} title="Você aprovou este artigo">
            <p className="mt-1">Ele está indo para o seu site.</p>
          </Notice>
        ) : null}

        <p className="text-[14px] text-muted">
          {deciding ? "Prévia, como vai aparecer no site" : `Criado em ${formatDate(post.created_at)}`}
          {post.reading_minutes ? `, leitura de ${post.reading_minutes} min` : ""}
        </p>
        <h1 className="display mt-2 text-[30px] [text-wrap:balance] sm:text-[42px]">{post.title}</h1>
        {post.excerpt ? <p className="mt-4 text-[18px] leading-relaxed text-muted">{post.excerpt}</p> : null}
        {post.author_name ? <p className="mt-4 text-[14px] text-muted">Por {post.author_name}</p> : null}

        <div className="mt-8">
          <ArticleView post={post} />
        </div>

      </div>

      {deciding ? <DecisionBar postId={post.id} /> : null}
    </div>
  );
}
