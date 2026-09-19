import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPostPreview } from "@/lib/data/posts";
import { siteArticleUrl } from "@/lib/delivery";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { PublicationBadge } from "@/components/ui/badge";
import { CONTENT_TYPES, isHttpUrl } from "@/lib/geo";
import { normalizeText } from "@/lib/seo";
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
  const answer = o?.overrideAnswerSummary || post.answerSummary;
  const faq = o?.overrideFaq.length ? o.overrideFaq : post.faq;
  const slug = post.slug;
  const address = active ? siteArticleUrl(active, slug || "artigo") : `/${slug || "artigo"}`;
  const date = post.publishedAt ?? post.updatedAt;
  // "atualizado" só aparece quando é de outro dia que a publicação
  const updated = post.publishedAt && formatDate(post.updatedAt) !== formatDate(post.publishedAt) ? post.updatedAt : null;
  const hasOverride = Boolean(
    o &&
      (o.overrideTitle ||
        o.overrideExcerpt ||
        o.overrideContentHtml ||
        o.overrideSeoTitle ||
        o.overrideSeoDescription ||
        o.overrideAnswerSummary ||
        o.overrideFaq.length),
  );

  // Autoria como o site mostraria: autor do artigo, senão o autor padrão do site; credenciais quando é o especialista do cliente.
  const context = active ?? sites.find((s) => s.publication.isCanonical) ?? sites[0] ?? null;
  const authorName = post.authorName || context?.defaultAuthor || post.author;
  const expertName = context?.client.expert_name?.trim() || "";
  const isExpert = Boolean(authorName && expertName && normalizeText(authorName) === normalizeText(expertName));
  const credentials = isExpert ? context?.client.expert_credentials?.trim() || null : null;
  const bio = isExpert ? context?.expertBio?.trim() || null : null;
  const contentTypeLabel = CONTENT_TYPES.find((t) => t.value === post.contentType)?.label ?? "Artigo";

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
                  !active ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface text-ink hover:border-ink",
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
                      on ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface text-ink hover:border-ink",
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
            <p className="text-[13px] font-semibold text-muted">{post.category || contentTypeLabel}</p>
            <h1 className="mt-2 text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-extrabold tracking-[-0.02em] text-ink">{title}</h1>
            {excerpt ? <p className="mt-4 font-serif text-[1.25rem] leading-relaxed text-muted">{excerpt}</p> : null}
            <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {authorName ? (
                <span>
                  Por <span className="font-medium text-ink">{authorName}</span>
                  {credentials ? `, ${credentials}` : ""}
                </span>
              ) : null}
              <span>
                {post.publishedAt ? "Publicado em " : "Rascunho de "}
                <time dateTime={date}>{formatDate(date)}</time>
              </span>
              {updated ? (
                <span>
                  Atualizado em <time dateTime={updated}>{formatDate(updated)}</time>
                </span>
              ) : null}
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

          {answer ? (
            <aside aria-labelledby="answer-title" className="mt-10 rounded-[var(--radius-control)] border border-line bg-sunken px-5 py-4 sm:px-6">
              <h2 id="answer-title" className="text-[13px] font-semibold text-ink">
                Resposta rápida
              </h2>
              <p className="mt-1.5 font-serif text-[1.1875rem] leading-relaxed text-text">{answer}</p>
            </aside>
          ) : null}

          {post.keyTakeaways.length ? (
            <section aria-labelledby="takeaways-title" className="mt-8 rounded-[var(--radius-control)] border border-line px-5 py-4 sm:px-6">
              <h2 id="takeaways-title" className="text-[15px] font-bold text-ink">
                Pontos principais
              </h2>
              <ul className="mt-2 space-y-1.5 font-serif text-[1.0625rem] leading-relaxed text-text">
                {post.keyTakeaways.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-ink" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {html ? (
            <div className="prose-article mt-10" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="mt-10 text-muted">O artigo ainda não tem texto.</p>
          )}

          {faq.length ? (
            <section aria-labelledby="faq-title" className="mt-12">
              <h2 id="faq-title" className="text-[1.6rem] leading-tight font-bold tracking-[-0.01em] text-ink">
                Perguntas frequentes
              </h2>
              <div className="mt-4 divide-y divide-line border-y border-line">
                {faq.map((f, i) => (
                  <details key={i} className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[1.0625rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {f.question}
                      <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="pb-4 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line text-text">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {post.sources.length ? (
            <section aria-labelledby="sources-title" className="mt-12">
              <h2 id="sources-title" className="text-[15px] font-bold text-ink">
                Fontes
              </h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-muted">
                {post.sources.map((src, i) => (
                  <li key={i}>
                    {isHttpUrl(src.url) ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink underline underline-offset-4 hover:text-brand-ink"
                      >
                        {src.title || src.url}
                      </a>
                    ) : (
                      <span className="font-medium text-ink">{src.title}</span>
                    )}
                    {src.publisher ? <span>, {src.publisher}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {authorName ? (
            <section aria-labelledby="author-title" className="mt-12 rounded-[var(--radius-control)] border border-line px-5 py-4 sm:px-6">
              <h2 id="author-title" className="text-[13px] font-semibold text-muted">
                Quem escreveu
              </h2>
              <p className="mt-1 text-[15px] font-semibold text-ink">{authorName}</p>
              {credentials ? <p className="text-sm text-muted">{credentials}</p> : null}
              {bio ? <p className="mt-2 font-serif text-[1rem] leading-relaxed text-text">{bio}</p> : null}
              <p className="mt-3 text-[13px] text-muted">
                Última atualização em <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
              </p>
            </section>
          ) : null}

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
