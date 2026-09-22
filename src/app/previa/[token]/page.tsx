import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getRunByToken } from "@/lib/data/automations";
import { formatDate } from "@/lib/utils";

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
  const faq = (post.faq ?? []) as { question: string; answer: string }[];
  const takeaways = (post.key_takeaways ?? []) as string[];

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

        <footer className="mt-10 border-t border-line pt-6 text-[13.5px] text-muted">
          Para aprovar ou pedir ajustes, volte à conversa do Telegram. Conteúdo produzido pela OutBox.
        </footer>
      </div>
    </div>
  );
}
