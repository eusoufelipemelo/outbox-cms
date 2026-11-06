import Image from "next/image";

export type ArticleViewPost = {
  cover_image_url: string | null;
  cover_image_alt: string | null;
  answer_summary: string | null;
  content_html: string;
  key_takeaways: unknown;
  faq: unknown;
};

/** Corpo do artigo como o leitor vai ver: capa, resposta direta, texto, resumo e perguntas frequentes. */
export function ArticleView({ post }: { post: ArticleViewPost }) {
  const faq = (post.faq ?? []) as { question: string; answer: string }[];
  const takeaways = (post.key_takeaways ?? []) as string[];
  return (
    <>
    {post.cover_image_url ? (
      <Image
        src={post.cover_image_url}
        alt={post.cover_image_alt ?? ""}
        width={1200}
        height={675}
        className="mb-8 h-auto w-full rounded-[var(--radius-panel)]"
        unoptimized
      />
    ) : null}

    {post.answer_summary ? (
      <p className="mb-8 rounded-[var(--radius-panel)] border border-line bg-surface p-5 text-[16px] text-text">{post.answer_summary}</p>
    ) : null}

    <article className="prose-article" dangerouslySetInnerHTML={{ __html: post.content_html }} />

    {takeaways.length ? (
      <section className="mt-10 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
        <h2 className="text-[17px] font-semibold text-ink">Em resumo</h2>
        <ul className="mt-3 space-y-2 text-[15px] text-text">
          {takeaways.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              {t}
            </li>
          ))}
        </ul>
      </section>
    ) : null}

    {faq.length ? (
      <section className="mt-6">
        <h2 className="text-[17px] font-semibold text-ink">Perguntas frequentes</h2>
        <dl className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface px-5">
          {faq.map((f, i) => (
            <div key={i} className="py-4">
              <dt className="font-semibold text-ink">{f.question}</dt>
              <dd className="mt-1 text-[15px] text-text">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    ) : null}
    </>
  );
}
