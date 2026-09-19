import type { CSSProperties } from "react";
import Image from "next/image";

// Lado da marca nas telas de entrada: o produto em uma imagem — um artigo sai e acende em vários sites.
// Hostnames genéricos (nunca clientes reais).
const SITES = [
  "marcenaria-exemplo.com.br",
  "clinica-exemplo.com.br",
  "advocacia-exemplo.com.br",
  "imobiliaria-exemplo.com.br",
  "padaria-exemplo.com.br",
];

// Geometria do diagrama (px): 5 linhas de 44 com 10 de intervalo = 260 de altura.
const ROW = 44;
const GAP = 10;
const HEIGHT = SITES.length * ROW + (SITES.length - 1) * GAP;
const WIDTH = 80;
const MID = HEIGHT / 2;
const rowCenter = (i: number) => i * (ROW + GAP) + ROW / 2;

// Sequência: cartão entra, botão é "apertado", cada linha corre e o site acende.
const PRESS_AT = 720;
const LINE_AT = 980;
const STEP = 130;
const LINE_MS = 520;
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function ArticleCard() {
  return (
    <div
      className="entry-anim entry-card notch rounded-[var(--radius-control)] bg-surface p-4 text-ink shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)]"
      style={delay(120)}
    >
      <p className="text-[15.5px] leading-snug font-bold tracking-[-0.01em]">Como escolher o MDF certo para móveis planejados</p>
      <div aria-hidden className="mt-3 space-y-1.5">
        <span className="block h-1.5 w-full rounded-full bg-line" />
        <span className="block h-1.5 w-[92%] rounded-full bg-line" />
        <span className="block h-1.5 w-[58%] rounded-full bg-line" />
      </div>
      <span
        className="entry-anim entry-press mt-4 flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-[13px] font-semibold whitespace-nowrap text-ink"
        style={delay(PRESS_AT)}
      >
        Publicar em {SITES.length} sites
      </span>
    </div>
  );
}

function Connectors() {
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} fill="none" className="shrink-0 overflow-visible">
      {SITES.map((site, i) => {
        const y = rowCenter(i);
        const d = `M0 ${MID} C ${WIDTH * 0.55} ${MID}, ${WIDTH * 0.45} ${y}, ${WIDTH} ${y}`;
        return (
          <g key={site}>
            <path d={d} stroke="rgb(255 255 255 / 0.14)" strokeWidth={1.5} />
            <path
              d={d}
              pathLength={1}
              stroke="var(--color-brand)"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="entry-anim entry-line"
              style={delay(LINE_AT + i * STEP)}
            />
          </g>
        );
      })}
      <circle cx={0} cy={MID} r={3.5} fill="var(--color-brand)" />
    </svg>
  );
}

function Destinations() {
  return (
    <ul className="min-w-0 flex-1 space-y-[10px]">
      {SITES.map((site, i) => {
        const lit = LINE_AT + i * STEP + LINE_MS - 100;
        return (
          <li
            key={site}
            className="entry-anim entry-row flex h-11 items-center gap-3 rounded-[var(--radius-control)] border border-brand/55 bg-white/[0.07] px-3"
            style={delay(lit)}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11.5px] font-semibold text-white/80 uppercase">
              {site.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/85">{site}</span>
            <span className="grid shrink-0 text-[12.5px] font-medium">
              <span className="entry-anim entry-queued col-start-1 row-start-1 text-right text-white/45" style={delay(lit)}>
                Na fila
              </span>
              <span
                className="entry-anim entry-live col-start-1 row-start-1 inline-flex items-center justify-end gap-1.5 text-white"
                style={delay(lit)}
              >
                <span className="size-1.5 rounded-full bg-brand" />
                No ar
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/brand/simbolo-branco.svg" alt="" width={size} height={size} priority />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">OutBox CMS</span>
    </div>
  );
}

/** Canto do símbolo laranja recortado pela borda: moldura, nunca fundo de texto. */
function Corner({ className }: { className: string }) {
  return <Image src="/brand/simbolo-laranja.svg" alt="" width={1248} height={1248} priority className={`pointer-events-none absolute max-w-none select-none ${className}`} />;
}

export function BrandPanel() {
  return (
    <>
      {/* desktop */}
      <aside
        aria-label="OutBox CMS"
        className="relative hidden overflow-hidden bg-black lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      >
        <Corner className="-top-[140px] -right-[140px] w-[280px] xl:-top-[180px] xl:-right-[180px] xl:w-[360px] 2xl:-top-[210px] 2xl:-right-[210px] 2xl:w-[420px]" />
        <Wordmark />

        {/* desenhado em 700px e reduzido por zoom em telas menores, para os endereços não cortarem */}
        <div aria-hidden className="my-10 flex w-[700px] max-w-none items-center [zoom:0.72] xl:[zoom:0.86] 2xl:[zoom:1]">
          <div className="w-[250px] shrink-0">
            <ArticleCard />
          </div>
          <Connectors />
          <Destinations />
        </div>

        <div>
          <h2 className="display text-[clamp(2.75rem,4.3vw,4.25rem)] !text-white">
            <span className="block">Um artigo.</span>
            <span className="block">Todos os sites.</span>
          </h2>
          <p className="mt-5 max-w-[42ch] text-[16px] leading-relaxed text-white/70">
            Escreva uma vez, escolha em quais blogs de clientes o artigo entra e publique em todos de uma vez, daqui.
          </p>
        </div>
      </aside>

      {/* mobile e tablet: faixa compacta */}
      <header className="relative overflow-hidden bg-black px-4 pt-5 pb-6 sm:px-8 lg:hidden">
        <Corner className="-top-[88px] -right-[88px] w-[176px]" />
        <Wordmark size={24} />
        <p className="display mt-6 pr-16 text-[clamp(1.75rem,7.4vw,2.5rem)] !text-white">
          <span className="block">Um artigo.</span>
          <span className="block">Todos os sites.</span>
        </p>
      </header>
    </>
  );
}
