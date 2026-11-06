import type { Metadata } from "next";
import Image from "next/image";
import { Check, Lightbulb, PencilLine, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: { default: "Área do cliente", template: "%s · Área do cliente OutBox" },
};

/** O produto em uma imagem: o artigo do cliente esperando a decisão dele. */
function ApprovalPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[440px]">
      <div className="absolute inset-x-6 -bottom-3 h-full rounded-[var(--radius-panel)] border border-line bg-surface/70" />
      <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-pop">
        <div className="relative aspect-[16/8] bg-[linear-gradient(135deg,#e9e4dc_0%,#d8d0c4_45%,#c9bfb1_100%)]">
          <div className="absolute inset-x-[14%] bottom-0 h-[58%] rounded-t-[10px] border-x-[10px] border-t-[10px] border-[#a8998a] bg-[#efe9e1]">
            <div className="grid h-full grid-cols-3 gap-[6px] p-[6px]">
              <span className="rounded-[3px] bg-[#ddd3c6]" />
              <span className="rounded-[3px] bg-[#ddd3c6]" />
              <span className="rounded-[3px] bg-[#ddd3c6]" />
            </div>
          </div>
        </div>
        <div className="p-5">
          <span className="inline-flex h-6 items-center rounded-full border border-ink/80 px-2.5 text-[12px] font-semibold text-ink">Esperando você</span>
          <p className="mt-3 text-[18px] leading-snug font-bold tracking-[-0.01em] text-ink">Quanto tempo dura um armário planejado de MDF?</p>
          <div className="mt-3 space-y-1.5">
            <span className="block h-1.5 w-full rounded-full bg-line" />
            <span className="block h-1.5 w-[86%] rounded-full bg-line" />
          </div>
          <div className="mt-5 grid grid-cols-[1.6fr_1fr] gap-2">
            <span className="flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-brand text-[13.5px] font-semibold text-black">
              <Check className="size-4" />
              Aprovar e publicar
            </span>
            <span className="flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong text-[13.5px] font-medium text-ink">
              <PencilLine className="size-3.5" />
              Pedir ajustes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const POINTS = [
  { icon: ShieldCheck, text: "Nada vai para o seu site sem o seu aprovado." },
  { icon: PencilLine, text: "Peça ajustes com as suas palavras." },
  { icon: Lightbulb, text: "Sugira os temas que seus clientes perguntam." },
];

// Telas de entrada da área do cliente: sempre claras, com a marca OutBox discreta.
export default function ClientEntryLayout({ children }: LayoutProps<"/cliente">) {
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative hidden flex-col border-r border-line bg-paper px-12 py-10 lg:flex xl:px-16">
        <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={112} height={28} priority />
        <div className="my-auto py-12">
          <h1 className="display max-w-[520px] text-[40px] [text-wrap:balance] xl:text-[46px]">Os artigos do seu site passam por você antes de ir ao ar.</h1>
          <div className="mt-12">
            <ApprovalPreview />
          </div>
          <ul className="mt-14 max-w-[440px] space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-text">
                <Icon className="size-[18px] shrink-0 text-ink" aria-hidden strokeWidth={1.9} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-faint">Área do cliente OutBox</p>
      </section>

      <main className="flex min-h-dvh flex-col px-5 py-8 sm:px-10 lg:py-12">
        <div className="lg:hidden">
          <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={104} height={26} priority />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
