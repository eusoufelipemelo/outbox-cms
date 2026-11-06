import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireClient } from "@/lib/client-auth";
import { listPortalItems, listPortalTopics, summarize } from "@/lib/data/client-area";
import { ArticleRow, DecisionCard } from "@/components/client-area/article-cards";

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function ClientHome() {
  const { account, company } = await requireClient();
  const [items, topics] = await Promise.all([listPortalItems(company.id), listPortalTopics(company.id)]);
  const s = summarize(items);
  const awaiting = items.filter((i) => i.status === "awaiting");
  const changes = items.filter((i) => i.status === "changes");
  const published = items.filter((i) => i.status === "published").slice(0, 4);
  const first = account.name.split(" ")[0];

  const status =
    s.awaiting > 0
      ? `${s.awaiting === 1 ? "Um artigo espera" : `${s.awaiting} artigos esperam`} a sua leitura antes de ir para o site.`
      : changes.length
        ? "Nada esperando você agora. A OutBox está ajustando o que você pediu."
        : "Nada esperando você agora. Quando um artigo novo ficar pronto, ele aparece aqui.";

  return (
    <div className="space-y-12">
      <header className="max-w-[720px]">
        <p className="text-[15px] text-muted">
          {greeting()}, {first}
        </p>
        <h1 className="display mt-1 text-[32px] [text-wrap:balance] sm:text-[44px]">{status}</h1>
        <p className="mt-4 text-[15px] text-muted">
          {s.publishedThisMonth
            ? `${plural(s.publishedThisMonth, "artigo foi", "artigos foram")} para o seu site este mês.`
            : `${plural(s.published, "artigo publicado", "artigos publicados")} no seu site até agora.`}
          {topics.queue.length ? ` ${plural(topics.queue.length, "tema seu está", "temas seus estão")} na fila.` : ""}
        </p>
      </header>

      {awaiting.length ? (
        <section aria-labelledby="esperando" className="space-y-4">
          <h2 id="esperando" className="sr-only">
            Esperando a sua aprovação
          </h2>
          <DecisionCard item={awaiting[0]} featured />
          {awaiting.length > 1 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {awaiting.slice(1, 5).map((it) => (
                <DecisionCard key={it.id} item={it} />
              ))}
            </div>
          ) : null}
          {awaiting.length > 5 ? (
            <Link href="/cliente/aprovar" className="inline-block text-[14.5px] font-medium text-ink underline underline-offset-4 hover:no-underline">
              Ver todos os {awaiting.length} artigos para aprovar
            </Link>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div className="space-y-10">
          {changes.length ? (
            <section aria-labelledby="ajustando">
              <h2 id="ajustando" className="text-[19px] font-bold text-ink">
                A OutBox está ajustando
              </h2>
              <p className="mt-1 text-[14px] text-muted">Volta para você aprovar assim que ficar pronto.</p>
              <div className="mt-3 -mx-3 space-y-1">
                {changes.map((it) => (
                  <ArticleRow key={it.id} item={it} />
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="no-ar">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="no-ar" className="text-[19px] font-bold text-ink">
                No ar no seu site
              </h2>
              {s.published > 4 ? (
                <Link href="/cliente/publicados" className="text-[14px] font-medium text-muted hover:text-ink">
                  Ver todos
                </Link>
              ) : null}
            </div>
            {published.length ? (
              <div className="mt-3 -mx-3 space-y-1">
                {published.map((it) => (
                  <ArticleRow key={it.id} item={it} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[15px] text-muted">O primeiro artigo aprovado por você aparece aqui, com o link do site.</p>
            )}
          </section>
        </div>

        <aside aria-labelledby="temas-convite" className="h-fit rounded-[var(--radius-panel)] border border-line bg-surface p-6">
          <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-sunken text-ink">
            <Lightbulb className="size-5" aria-hidden />
          </span>
          <h2 id="temas-convite" className="mt-4 text-[19px] font-bold text-ink [text-wrap:balance]">
            Tem um assunto que seus clientes sempre perguntam?
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
            Mande o tema com as suas palavras. A OutBox escreve o artigo e ele chega aqui para você aprovar.
          </p>
          <Link
            href="/cliente/temas"
            className="mt-5 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-strong px-4 text-[14px] font-medium text-ink transition-colors hover:border-ink"
          >
            Sugerir um tema
          </Link>
        </aside>
      </div>
    </div>
  );
}
