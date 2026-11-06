import type { Metadata } from "next";
import { requireClient } from "@/lib/client-auth";
import { listPortalItems } from "@/lib/data/client-area";
import { ArticleRow } from "@/components/client-area/article-cards";
import { ClientPageHeader } from "@/components/client-area/shell";

export const metadata: Metadata = { title: "Publicados" };

export default async function PublishedPage() {
  const { company } = await requireClient();
  const items = (await listPortalItems(company.id)).filter((i) => i.status === "published");

  // agrupa por mês de publicação
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = fmt.format(new Date(it.date));
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <div className="max-w-[820px]">
      <ClientPageHeader
        title="Publicados"
        description="Os artigos que estão no ar no seu site. Toque em um para abrir."
      />
      {items.length ? (
        <div className="space-y-10">
          {[...groups].map(([month, list]) => (
            <section key={month} aria-label={month}>
              <h2 className="border-b border-line pb-2 text-[15px] font-semibold text-ink first-letter:uppercase">
                {month}
                <span className="ml-2 font-normal text-muted">
                  {list.length} {list.length === 1 ? "artigo" : "artigos"}
                </span>
              </h2>
              <div className="mt-3 -mx-3 space-y-1">
                {list.map((it) => (
                  <ArticleRow key={it.id} item={it} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-[15px] text-muted">
          Nenhum artigo no ar ainda. Assim que você aprovar o primeiro, ele aparece aqui com o link do site.
        </p>
      )}
    </div>
  );
}
