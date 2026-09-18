import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPostPreview } from "@/lib/data/posts";
import { siteArticleUrl } from "@/lib/delivery";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { PublicationBadge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Pré-visualização" };

export default async function PreviewPage({ params, searchParams }: PageProps<"/artigos/[id]/preview">) {
  await requireUser();
  const { id } = await params;
  const { site: siteParam } = await searchParams;
  if (!GUID.test(id)) notFound();
  const data = await getPostPreview(id);
  if (!data) notFound();

  const { post, sites } = data;
  const active = sites.find((s) => s.id === (Array.isArray(siteParam) ? siteParam[0] : siteParam)) ?? null;
  const o = active?.override;
  const title = o?.overrideTitle || post.title || "Sem título";
  const excerpt = o?.overrideExcerpt || post.excerpt;
  const html = sanitizeArticleHtml(o?.overrideContentHtml || post.contentHtml);
  const slug = post.slug;
  const address = active ? siteArticleUrl(active, slug || "artigo") : `/${slug || "artigo"}`;
  const date = post.publishedAt ?? post.updatedAt;
  const hasOverride = Boolean(
    o && (o.overrideTitle || o.overrideExcerpt || o.overrideContentHtml || o.overrideSeoTitle || o.overrideSeoDescription),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/artigos/${post.id}`}
          className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar ao editor
        </Link>
        <p className="text-[13px] text-muted">Mostrando a última versão salva.</p>
      </div>

      {sites.length ? (
        <nav aria-label="Ver como aparece em cada site" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            <li>
              <Link
                href={`/artigos/${post.id}/preview`}
                aria-current={!active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-[var(--radius-chip)] border px-4 text-sm font-medium transition-colors",
                  !active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
                )}
              >
                Texto principal
              </Link>
            </li>
            {sites.map((s) => {
              const on = active?.id === s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/artigos/${post.id}/preview?site=${s.id}`}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-[var(--radius-chip)] border px-4 text-sm font-medium transition-colors",
                      on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
                    )}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-full border border-white/40"
                      style={{ backgroundColor: s.client.brand_color || "var(--color-line-strong)" }}
                    />
                    {s.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {active ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <PublicationBadge status={active.publication.status} />
          <span>{hasOverride ? "Com variação própria para este site." : "Sem variação: usa o texto principal."}</span>
          {active.publication.isCanonical ? <span>Este é o site original.</span> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        <div className="flex h-11 items-center gap-3 border-b border-line bg-sunken px-4">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">{address}</span>
        </div>

        <article className="mx-auto max-w-[760px] px-5 py-10 sm:px-10 sm:py-14">
          <header>
            {post.category ? <p className="text-[13px] font-semibold text-muted">{post.category}</p> : null}
            <h1 className="mt-2 text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-extrabold tracking-[-0.02em] text-ink">{title}</h1>
            {excerpt ? <p className="mt-4 font-serif text-[1.25rem] leading-relaxed text-muted">{excerpt}</p> : null}
            <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {post.author ? <span>Por {post.author}</span> : null}
              <time dateTime={date}>{formatDate(date)}</time>
              {post.readingMinutes ? <span>{post.readingMinutes} min de leitura</span> : null}
            </p>
          </header>

          {post.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem pode vir de qualquer host
            <img
              src={post.coverImageUrl}
              alt={post.coverImageAlt ?? ""}
              className="mt-8 aspect-[2/1] w-full rounded-[var(--radius-panel)] bg-sunken object-cover"
            />
          ) : null}

          {html ? (
            <div className="prose-article mt-10" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="mt-10 text-muted">O artigo ainda não tem texto.</p>
          )}

          {post.tags.length ? (
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6" aria-label="Tags">
              {post.tags.map((t) => (
                <li key={t} className="rounded-[var(--radius-chip)] bg-sunken px-3 py-1 text-[13px] text-muted">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>
    </div>
  );
}
