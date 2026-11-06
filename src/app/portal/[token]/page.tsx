import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPortalClient, listPortalItems, listPortalTopics, type PortalItem } from "@/lib/data/portal";
import { SuggestTopic } from "@/components/portal/suggest-topic";
import { PortalShell } from "@/components/portal/portal-shell";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/portal/[token]">): Promise<Metadata> {
  const { token } = await params;
  const client = await getPortalClient(token);
  return { title: client ? `${client.name} · Área do cliente` : "Área do cliente", robots: { index: false, follow: false } };
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many.replace("#", String(n));
}

export default async function PortalPage({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const client = await getPortalClient(token);
  if (!client) notFound();
  const [items, topics] = await Promise.all([listPortalItems(client.id), listPortalTopics(client.id)]);
  const awaiting = items.filter((i) => i.status === "awaiting");
  const changes = items.filter((i) => i.status === "changes");
  const published = items.filter((i) => i.status === "published");

  return (
    <PortalShell>
      <p className="text-[14px] text-muted">{client.name}</p>
      <h1 className="display mt-1 text-[clamp(1.9rem,6vw,2.6rem)] leading-[1.05]">
        {awaiting.length
          ? plural(awaiting.length, "1 artigo esperando a sua aprovação", "# artigos esperando a sua aprovação")
          : "Nenhum artigo esperando aprovação"}
      </h1>
      <p className="mt-3 max-w-[56ch] text-[15px] text-muted">
        {awaiting.length
          ? "Abra cada artigo, leia com calma e escolha: aprovar e publicar no seu site, ou pedir ajustes para a equipe da OutBox."
          : "Quando a OutBox preparar um artigo novo, ele aparece aqui para você aprovar."}
      </p>

      {awaiting.length ? <Section title="Para aprovar" items={awaiting} token={token} /> : null}
      {changes.length ? <Section title="Em ajuste com a OutBox" items={changes} token={token} /> : null}
      <section className="mt-10">
        <h2 className="text-[16px] font-semibold text-ink">Quer um artigo sobre um tema seu?</h2>
        <p className="mt-1 text-[14px] text-muted">Envie o tema. A OutBox escreve e o artigo aparece aqui para você aprovar.</p>
        <SuggestTopic token={token} />
        {topics.length ? (
          <div className="mt-3">
            <p className="text-[13px] text-muted">Temas na fila para escrever</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-text">
              {topics.map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {published.length ? <Section title="Publicados no seu site" items={published} token={token} /> : null}
    </PortalShell>
  );
}

function Section({ title, items, token }: { title: string; items: PortalItem[]; token: string }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[16px] font-semibold text-ink">
        {title} <span className="font-normal text-muted tabular-nums">{items.length}</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/portal/${token}/${it.id}`} className="flex gap-3.5 p-3.5 transition-colors hover:bg-sunken sm:p-4">
              {it.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- capa no R2
                <img src={it.cover} alt="" className="size-[72px] shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span aria-hidden className="size-[72px] shrink-0 rounded-[10px] bg-sunken" />
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-ink">{it.title}</span>
                <span className="mt-1 block text-[13px] text-muted">
                  {it.status === "awaiting"
                    ? `Enviado em ${formatDate(it.date)}`
                    : it.status === "changes"
                      ? "A OutBox está ajustando com o que você pediu"
                      : `No ar desde ${formatDate(it.date)}`}
                </span>
                {it.status === "changes" && it.feedback ? <span className="mt-1.5 line-clamp-2 block text-[13px] text-text">Você pediu: {it.feedback}</span> : null}
                {it.status === "published" && it.url ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-muted">
                    Ver no site
                    <ExternalLink className="size-3" aria-hidden />
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
