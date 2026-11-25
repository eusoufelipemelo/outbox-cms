import "server-only";
/* eslint-disable @next/next/no-img-element -- JSX desenhado em imagem pelo next/og, não é página */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Lâminas do programa diário no formato "tweet", modo claro da OutBox: foto, nome e @ no topo,
 * texto grande, frase final em negrito, imagem de apoio embaixo e o selo do programa no canto
 * (como o logo do canal na tela da TV). 1080×1350, JPEG.
 */

export type Author = { name: string; handle: string; avatar: string | null; /** Foto grande (fechamento do formato editorial). */ photo?: string | null };
export type TweetSlide = { text: string; bold?: string; image?: string | null };

const W = 1080;
const H = 1350;
const PAD = 80;
export const TWEET_IMAGE = { width: W - PAD * 2, height: 470 };

const C = { paper: "#ffffff", ink: "#15171b", muted: "#6b6f78", line: "#e6e6e9", accent: "#f15532" };

const root = process.cwd();
const fonts = Promise.all([
  readFile(join(root, "src/assets/fonts/Archivo-Medium.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-Bold.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-ExtraBold-Expanded.ttf")),
]);

async function render(node: React.ReactElement): Promise<Buffer> {
  const [medium, bold, display] = await fonts;
  const png = await new ImageResponse(node, {
    width: W,
    height: H,
    fonts: [
      { name: "Archivo", data: medium, weight: 500, style: "normal" },
      { name: "Archivo", data: bold, weight: 700, style: "normal" },
      { name: "Display", data: display, weight: 800, style: "normal" },
    ],
  }).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** Corpo menor quando o texto é longo, para caber sem cortar (a imagem ocupa a metade de baixo). */
function bodySize(chars: number, withImage: boolean): number {
  if (!withImage) return chars > 220 ? 52 : chars > 150 ? 58 : 64;
  return chars > 190 ? 44 : chars > 140 ? 49 : 54;
}

function Header({ author, program }: { author: Author; program: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {author.avatar ? (
          <img src={author.avatar} width={104} height={104} alt="" style={{ borderRadius: 999, objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: 104, height: 104, borderRadius: 999, background: C.line }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
          <span style={{ fontSize: 38, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{author.name}</span>
          <span style={{ fontSize: 30, fontWeight: 500, color: C.muted, marginTop: 4 }}>@{author.handle}</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: C.accent,
          color: "#ffffff",
          borderRadius: 999,
          padding: "14px 26px 14px 22px",
          fontFamily: "Display",
          fontSize: 24,
          letterSpacing: "-0.01em",
        }}
      >
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#ffffff", marginRight: 12 }} />
        {program}
      </div>
    </div>
  );
}

/** Uma lâmina: texto + negrito + imagem opcional. `index`/`total` viram o número no canto. */
export function tweetSlide(author: Author, program: string, s: TweetSlide, index: number, total: number): Promise<Buffer> {
  const withImage = Boolean(s.image);
  const size = bodySize(s.text.length + (s.bold?.length ?? 0), withImage);
  return render(
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: C.paper, fontFamily: "Archivo", padding: `${PAD}px ${PAD}px 0` }}>
      <Header author={author} program={program} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 52, marginBottom: withImage ? 36 : 0, flexGrow: 1, flexShrink: 1, overflow: "hidden", justifyContent: withImage ? "flex-start" : "center", paddingBottom: withImage ? 0 : 120 }}>
        <div style={{ display: "flex", fontSize: size, lineHeight: 1.3, fontWeight: 500, color: C.ink, letterSpacing: "-0.01em" }}>{s.text}</div>
        {s.bold ? (
          <div style={{ display: "flex", fontSize: size, lineHeight: 1.3, fontWeight: 700, color: C.ink, marginTop: Math.round(size * 0.7), letterSpacing: "-0.01em" }}>
            {s.bold}
          </div>
        ) : null}
      </div>
      {s.image ? (
        <img src={s.image} width={TWEET_IMAGE.width} height={TWEET_IMAGE.height} alt="" style={{ borderRadius: 32, objectFit: "cover", border: `1px solid ${C.line}`, flexShrink: 0 }} />
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 96, flexShrink: 0, fontSize: 24, color: C.muted, fontWeight: 500 }}>
        <span>{index === 1 ? "Arrasta para o lado" : ""}</span>
        <span>
          {index}/{total}
        </span>
      </div>
    </div>,
  );
}

/** Imagem de apoio já recortada no tamanho da lâmina, como data URL. */
export async function tweetImage(bytes: Uint8Array): Promise<string | null> {
  try {
    const buf = await sharp(Buffer.from(bytes)).resize(TWEET_IMAGE.width * 2, TWEET_IMAGE.height * 2, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Foto do autor redonda no cabeçalho. */
export async function avatarData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(208, 208, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ---------- Formato editorial: capa com foto que se dissolve no escuro, lâminas claras e escuras alternadas ----------

const DARK = "#141518";
const LIGHT = "#f6f5f2";
export const EDITORIAL_COVER = { width: W, height: 860 };
export const EDITORIAL_IMAGE = { width: W - PAD * 2, height: 520 };

function coverHeadSize(chars: number): number {
  return chars > 80 ? 52 : chars > 60 ? 58 : chars > 44 ? 66 : chars > 30 ? 76 : 88;
}

/** Rodapé do formato editorial: "Felipe Melo | IA na prática". */
function Signature({ name, color }: { name: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", fontSize: 22, fontWeight: 700, letterSpacing: "0.14em", color, textTransform: "uppercase" }}>
      {name}
      <div style={{ display: "flex", width: 2, height: 24, background: color, margin: "0 18px", opacity: 0.6 }} />
      IA na prática
    </div>
  );
}

/** Capa: foto em cima que se dissolve no escuro, manchete centralizada e a linha laranja (quadro e fonte). */
export function editorialCover(author: Author, input: { headline: string; kicker: string; image: string | null }): Promise<Buffer> {
  const size = coverHeadSize(input.headline.length);
  return render(
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: DARK, fontFamily: "Archivo", position: "relative" }}>
      {input.image ? (
        <img src={input.image} width={EDITORIAL_COVER.width} height={EDITORIAL_COVER.height} alt="" style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: `linear-gradient(180deg, rgba(20,21,24,0) 0%, rgba(20,21,24,0) 38%, rgba(20,21,24,0.85) 58%, ${DARK} 68%)`,
        }}
      />
      <div style={{ position: "absolute", left: PAD, right: PAD, bottom: 70, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            textAlign: "center",
            justifyContent: "center",
            fontFamily: "Display",
            fontSize: size,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            textTransform: "uppercase",
          }}
        >
          {input.headline}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 26, fontWeight: 700, color: C.accent, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>
          {input.kicker}
        </div>
        <div style={{ display: "flex", marginTop: 64 }}>
          <Signature name={author.name} color="rgba(255,255,255,0.8)" />
        </div>
      </div>
    </div>,
  );
}

export type EditorialSlide = { title?: string; text: string; highlight?: string; image?: string | null };

/** Lâmina do meio: fundo claro ou escuro, título laranja, parágrafos curtos, trecho final em laranja, foto opcional. */
export function editorialSlide(s: EditorialSlide, dark: boolean, imageFirst: boolean): Promise<Buffer> {
  const ink = dark ? "#ffffff" : C.ink;
  const chars = s.text.length + (s.highlight?.length ?? 0);
  const size = s.image ? (chars > 240 ? 36 : chars > 190 ? 40 : chars > 140 ? 44 : 48) : chars > 280 ? 44 : chars > 200 ? 50 : 56;
  const paragraphs = s.text.split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((p) => p.trim()).filter(Boolean);
  const titleEl = s.title ? (
    <div style={{ display: "flex", fontFamily: "Display", fontSize: 50, lineHeight: 1.08, color: C.accent, letterSpacing: "-0.02em", marginBottom: 34 }}>{s.title}</div>
  ) : null;
  const bodyEl = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {paragraphs.map((p, i) => (
        <div key={i} style={{ display: "flex", fontSize: size, lineHeight: 1.32, fontWeight: 500, color: ink, marginBottom: Math.round(size * 0.6) }}>
          {p}
        </div>
      ))}
      {s.highlight ? <div style={{ display: "flex", fontSize: size, lineHeight: 1.32, fontWeight: 700, color: C.accent }}>{s.highlight}</div> : null}
    </div>
  );
  const img = s.image ? (
    <img src={s.image} width={EDITORIAL_IMAGE.width} height={EDITORIAL_IMAGE.height} alt="" style={{ borderRadius: 28, objectFit: "cover", flexShrink: 0 }} />
  ) : null;
  return render(
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        justifyContent: img ? "flex-start" : "center",
        background: dark ? DARK : LIGHT,
        fontFamily: "Archivo",
        padding: `${PAD + 16}px ${PAD}px`,
      }}
    >
      {titleEl}
      {img && imageFirst ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {img}
          <div style={{ display: "flex", marginTop: 44 }}>{bodyEl}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flexGrow: img ? 1 : 0, justifyContent: "space-between" }}>
          {bodyEl}
          {img}
        </div>
      )}
    </div>,
  );
}

/** Fechamento: a foto do Felipe à esquerda se dissolvendo no escuro, texto à direita e a caixa laranja de chamada. */
export function editorialClosing(author: Author, input: { text: string; cta: string }): Promise<Buffer> {
  const paragraphs = input.text.split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((p) => p.trim()).filter(Boolean);
  return render(
    <div style={{ width: W, height: H, display: "flex", background: DARK, fontFamily: "Archivo", position: "relative" }}>
      {author.photo ? <img src={author.photo} width={640} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} /> : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: `linear-gradient(90deg, rgba(20,21,24,0) 0%, rgba(20,21,24,0.2) 30%, rgba(20,21,24,0.92) 52%, ${DARK} 62%)`,
        }}
      />
      <div style={{ position: "absolute", right: PAD, top: 170, width: 520, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        {paragraphs.map((p, i) => (
          <div key={i} style={{ display: "flex", fontSize: 40, lineHeight: 1.3, fontWeight: 500, color: "#ffffff", textAlign: "right", marginBottom: 28 }}>
            {p}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", right: PAD, bottom: 190, width: 600, display: "flex", background: C.accent, padding: "34px 40px", fontSize: 36, lineHeight: 1.25, fontWeight: 700, color: "#ffffff" }}>
        {input.cta}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center" }}>
        <Signature name={author.name} color="rgba(255,255,255,0.7)" />
      </div>
    </div>,
  );
}

/** Foto já recortada para os tamanhos do formato editorial. */
export async function fitImage(bytes: Uint8Array, width: number, height: number): Promise<string | null> {
  try {
    const buf = await sharp(Buffer.from(bytes)).resize(width, height, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Foto grande do Felipe para o fechamento (metade esquerda da lâmina). */
export async function photoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return fitImage(new Uint8Array(await res.arrayBuffer()), 640, H);
  } catch {
    return null;
  }
}
