import Link from "next/link";
import { PenLine, Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

const steps = [
  {
    title: "Cadastre um cliente e o site dele",
    body: "Nome, tom de voz e o endereço do blog. O CMS entrega por API, WordPress ou webhook.",
  },
  {
    title: "Escreva o artigo uma vez",
    body: "No editor, com os campos de SEO e, se estiver ligado, o assistente de escrita.",
  },
  {
    title: "Escolha os sites e publique",
    body: "O mesmo artigo vai para todos os blogs selecionados, agora ou na data agendada.",
  },
];

/** Instalação nova: nenhum cliente cadastrado. */
export function Onboarding() {
  return (
    <section aria-labelledby="comecar" className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
      <h2 id="comecar" className="display text-[clamp(1.5rem,2.4vw,1.875rem)]">
        Nenhum cliente por aqui ainda
      </h2>
      <p className="mt-3 max-w-[58ch] text-[15px] text-muted">
        O painel mostra há quantos dias cada blog de cliente está sem artigo novo. Cadastre o primeiro cliente para começar a
        acompanhar a rede.
      </p>
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="border-t border-line-strong pt-4">
            <p className="text-[13px] font-semibold text-muted tabular-nums">Passo {i + 1}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <Link href="/clientes/novo" className={buttonClass("primary", "lg")}>
          <Plus className="size-4" aria-hidden />
          Cadastrar primeiro cliente
        </Link>
      </div>
    </section>
  );
}

/** Há clientes, mas nenhum artigo escrito. */
export function FirstArticle() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[17px] font-semibold text-ink">Nenhum artigo escrito ainda</p>
        <p className="mt-1 max-w-[56ch] text-sm text-muted">
          Os sites já estão cadastrados. Escreva o primeiro artigo e escolha em quais blogs ele vai ao ar.
        </p>
      </div>
      <Link href="/artigos/novo" className={buttonClass("primary", "md")}>
        <PenLine className="size-4" aria-hidden />
        Escrever o primeiro artigo
      </Link>
    </section>
  );
}
