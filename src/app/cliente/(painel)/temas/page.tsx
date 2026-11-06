import type { Metadata } from "next";
import Link from "next/link";
import { requireClient } from "@/lib/client-auth";
import { listPortalTopics } from "@/lib/data/client-area";
import { ClientPageHeader } from "@/components/client-area/shell";
import { RemoveTopicButton, TopicForm } from "@/components/client-area/topic-form";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Sugerir temas" };

export default async function TopicsPage() {
  const { company } = await requireClient();
  const { queue, done } = await listPortalTopics(company.id);

  return (
    <div>
      <ClientPageHeader
        title="Sugerir temas"
        description="Você conhece as dúvidas dos seus clientes melhor do que ninguém. Mande o assunto e a OutBox transforma em artigo para o seu site."
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <TopicForm />

        <div className="space-y-10">
          <section aria-labelledby="fila">
            <h2 id="fila" className="text-[19px] font-bold text-ink">
              Na fila
            </h2>
            <p className="mt-1 text-[14px] text-muted">Os próximos artigos saem nesta ordem e chegam em Para aprovar.</p>
            {queue.length ? (
              <ol className="mt-4 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
                {queue.map((t, i) => (
                  <li key={t.id} className="flex items-start gap-4 px-4 py-3.5">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-semibold text-ink tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-snug font-medium text-ink">{t.title}</p>
                      {t.notes ? <p className="mt-1 line-clamp-2 text-[13.5px] text-muted">{t.notes}</p> : null}
                      <p className="mt-1 text-[12.5px] text-faint">
                        {t.source === "cliente" ? "Enviado por você" : "Combinado com a OutBox"} em {formatDate(t.created_at)}
                      </p>
                    </div>
                    {t.source === "cliente" ? <RemoveTopicButton id={t.id} title={t.title} /> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-5 py-8 text-center text-[14.5px] text-muted">
                A fila está vazia. Os temas que você enviar aparecem aqui, na ordem em que viram artigo.
              </p>
            )}
          </section>

          {done.length ? (
            <section aria-labelledby="viraram">
              <h2 id="viraram" className="text-[19px] font-bold text-ink">
                Já viraram artigo
              </h2>
              <ul className="mt-3 space-y-2">
                {done.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-4 text-[14.5px]">
                    {t.post_id ? (
                      <Link href={`/cliente/artigos/${t.post_id}`} className="min-w-0 truncate text-ink underline-offset-4 hover:underline">
                        {t.title}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate text-ink">{t.title}</span>
                    )}
                    {t.used_at ? <span className="shrink-0 text-[13px] text-muted">{formatDate(t.used_at)}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
