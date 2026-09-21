import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Diagnostic } from "@/lib/data/diagnostics";
import { aiReadiness, cityFromAddress, type PillarStatus } from "@/lib/diagnostics/ai-readiness";

// Bloco sempre preto (nos dois temas e na impressão): cores fixas, contraste AA sobre #000.
const STATUS: Record<PillarStatus, { label: string; color: string; ring: string; Icon: typeof Check }> = {
  pronto: { label: "Pronto", color: "text-[#52c98f]", ring: "border-[#52c98f]/40 bg-[#52c98f]/10", Icon: Check },
  parcial: { label: "Parcial", color: "text-[#e8b85a]", ring: "border-[#e8b85a]/40 bg-[#e8b85a]/10", Icon: Minus },
  falta: { label: "Falta", color: "text-[#ff7b6e]", ring: "border-[#ff7b6e]/40 bg-[#ff7b6e]/10", Icon: X },
  "sem-dados": { label: "Não medido", color: "text-[#a4a7ae]", ring: "border-white/20 bg-white/5", Icon: Minus },
};

function question(d: Diagnostic): string {
  const category = d.business?.category?.toLowerCase();
  const city = d.city || cityFromAddress(d.business?.address);
  return `Qual ${category ?? "empresa do meu segmento"} você me indica ${city ? `em ${city}` : "perto de mim"}?`;
}

/** A seção de destaque do relatório: a empresa nas respostas das IAs (GEO). */
export function AiSpotlight({ d }: { d: Diagnostic }) {
  const pillars = aiReadiness(d.site_checks, d.business);
  const ready = pillars.filter((p) => p.status === "pronto").length;
  const name = d.business_name || d.business?.name || "sua empresa";

  return (
    <section
      aria-labelledby="ia-titulo"
      className="notch relative rounded-[var(--radius-panel)] bg-black p-6 text-white break-inside-avoid-page [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:p-10"
    >
      <h2 id="ia-titulo" className="display max-w-[22ch] text-[clamp(1.75rem,4.2vw,2.75rem)] !text-white">
        Seus clientes já perguntam para a IA. Ela indica {name}?
      </h2>
      <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-white/75">
        ChatGPT, Gemini, Perplexity e as respostas com IA do próprio Google resumem o mercado e indicam poucas empresas, sem mostrar uma lista de
        links. A IA recomenda quem ela consegue ler no site, confirmar em conteúdo recente e checar no Google Empresas. Preparar a empresa para
        isso se chama GEO, a otimização para buscas com IA, e funciona junto com o SEO.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* A conversa: a pergunta do cliente e o que a IA confere antes de responder */}
        <div className="rounded-[var(--radius-panel)] border border-white/15 bg-white/[0.04] p-5 lg:self-start" aria-label="Simulação de pergunta a um assistente de IA">
          <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] text-black">{question(d)}</div>
          <div className="mt-4 max-w-[96%] rounded-2xl rounded-bl-md border border-white/15 px-4 py-3">
            <p className="text-[14.5px] text-white/80">Antes de indicar alguém, eu confiro:</p>
            <ul className="mt-3 space-y-2.5">
              {pillars.map((p) => {
                const s = STATUS[p.status];
                return (
                  <li key={p.key} className="flex items-start gap-2.5 text-[14.5px]">
                    <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", s.ring, s.color)}>
                      <s.Icon className="size-3" aria-hidden />
                    </span>
                    <span className="text-white/90">
                      {p.short} <span className={cn("font-semibold", s.color)}>{s.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-5 text-[13px] text-white/60">
            Hoje {name} está {ready === 3 ? "pronta nos 3 pilares" : `pronta em ${ready} de 3 pilares`} que as IAs usam para recomendar uma empresa.
          </p>
        </div>

        {/* Os pilares, com o que foi medido e o que a OutBox faz */}
        <ol className="grid gap-3">
          {pillars.map((p) => {
            const s = STATUS[p.status];
            return (
              <li key={p.key} className="rounded-[var(--radius-panel)] border border-white/15 p-5 break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[17px] font-bold text-white">{p.title}</h3>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold", s.ring, s.color)}>{s.label}</span>
                </div>
                <p className="mt-1.5 text-[14px] text-white/65">{p.why}</p>
                <p className="mt-3 text-[14.5px] text-white">
                  <span className="font-semibold">Hoje: </span>
                  {p.detail}
                </p>
                <p className="mt-2 text-[14.5px] text-white/85">
                  <span className="font-semibold text-[#ff8c6e]">O que fazemos: </span>
                  {p.action}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
