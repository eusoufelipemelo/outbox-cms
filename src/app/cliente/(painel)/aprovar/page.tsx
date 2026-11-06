import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { requireClient } from "@/lib/client-auth";
import { listPortalItems } from "@/lib/data/client-area";
import { ArticleRow, DecisionCard } from "@/components/client-area/article-cards";
import { ClientPageHeader } from "@/components/client-area/shell";

export const metadata: Metadata = { title: "Para aprovar" };

export default async function ToApprovePage() {
  const { company } = await requireClient();
  const items = await listPortalItems(company.id);
  const awaiting = items.filter((i) => i.status === "awaiting");
  const changes = items.filter((i) => i.status === "changes");

  return (
    <div>
      <ClientPageHeader
        title="Para aprovar"
        description="Leia cada artigo como ele vai aparecer no seu site. Aprove, peça ajustes com as suas palavras ou recuse."
      />

      {awaiting.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {awaiting.map((it) => (
            <DecisionCard key={it.id} item={it} />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <CircleCheckBig className="mx-auto size-8 text-ok" aria-hidden strokeWidth={1.6} />
          <p className="mt-3 text-[17px] font-semibold text-ink">Você está em dia</p>
          <p className="mx-auto mt-1 max-w-[420px] text-[14.5px] text-muted">
            Nenhum artigo esperando a sua aprovação. Quer um artigo sobre um assunto específico?{" "}
            <Link href="/cliente/temas" className="font-medium text-ink underline underline-offset-4 hover:no-underline">
              Sugira um tema
            </Link>
            .
          </p>
        </div>
      )}

      {changes.length ? (
        <section aria-labelledby="em-ajuste" className="mt-12 max-w-[760px]">
          <h2 id="em-ajuste" className="text-[19px] font-bold text-ink">
            Em ajuste pela OutBox
          </h2>
          <p className="mt-1 text-[14px] text-muted">Você pediu mudanças nestes. Eles voltam para cá prontos para aprovar.</p>
          <div className="mt-3 -mx-3 space-y-1">
            {changes.map((it) => (
              <ArticleRow key={it.id} item={it} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
