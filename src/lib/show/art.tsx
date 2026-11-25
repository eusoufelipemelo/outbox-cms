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

export type Author = { name: string; handle: string; avatar: string | null };
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

// ---------- Capa chamativa: foto grande em cima, manchete gigante no painel branco ----------

/** Área da foto da capa chamativa (largura total, parte de cima). */
export const COVER_PHOTO = { width: W, height: 780 };

function headlineSize(chars: number): number {
  return chars > 60 ? 58 : chars > 46 ? 66 : chars > 32 ? 76 : 88;
}

/** Palavras da manchete, marcando as que fazem parte do trecho em destaque (vai em laranja). */
function markWords(headline: string, highlight: string): { word: string; hot: boolean }[] {
  const words = headline.trim().split(/\s+/);
  const hot = highlight.trim().split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!hot.length) return words.map((word) => ({ word, hot: false }));
  // acha a sequência do destaque dentro da manchete
  for (let i = 0; i + hot.length <= words.length; i++) {
    if (hot.every((h, k) => norm(words[i + k]) === norm(h))) {
      return words.map((word, j) => ({ word, hot: j >= i && j < i + hot.length }));
    }
  }
  return words.map((word) => ({ word, hot: false }));
}

export function headlineCover(author: Author, program: string, input: { headline: string; highlight: string; image: string | null }, total: number): Promise<Buffer> {
  const size = headlineSize(input.headline.length);
  const words = markWords(input.headline, input.highlight);
  return render(
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: C.paper, fontFamily: "Archivo", position: "relative" }}>
      {/* foto */}
      <div style={{ display: "flex", width: W, height: COVER_PHOTO.height, background: C.line, position: "relative" }}>
        {input.image ? <img src={input.image} width={COVER_PHOTO.width} height={COVER_PHOTO.height} alt="" style={{ objectFit: "cover" }} /> : null}
        <div
          style={{
            position: "absolute",
            top: 56,
            left: PAD,
            display: "flex",
            alignItems: "center",
            background: C.accent,
            color: "#ffffff",
            borderRadius: 999,
            padding: "14px 26px 14px 22px",
            fontFamily: "Display",
            fontSize: 24,
          }}
        >
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#ffffff", marginRight: 12 }} />
          {program}
        </div>
      </div>
      {/* foto do Felipe sobre a divisa */}
      <div style={{ position: "absolute", top: COVER_PHOTO.height - 74, right: PAD, display: "flex", width: 148, height: 148, borderRadius: 999, background: C.paper, padding: 7 }}>
        {author.avatar ? (
          <img src={author.avatar} width={134} height={134} alt="" style={{ borderRadius: 999, objectFit: "cover", border: `5px solid ${C.accent}` }} />
        ) : (
          <div style={{ display: "flex", width: 134, height: 134, borderRadius: 999, background: C.accent }} />
        )}
      </div>
      {/* manchete */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `48px ${PAD}px 0` }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.muted, marginBottom: 22 }}>
          {author.name} | IA na prática
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Display", fontSize: size, lineHeight: 1.02, letterSpacing: "-0.02em", textTransform: "uppercase", paddingRight: 120 }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: w.hot ? C.accent : C.ink, marginRight: Math.round(size * 0.26) }}>
              {w.word}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 96, padding: `0 ${PAD}px`, fontSize: 24, color: C.muted, fontWeight: 500 }}>
        <span>Arrasta para o lado</span>
        <span>1/{total}</span>
      </div>
    </div>,
  );
}

/** Foto da capa chamativa já recortada, como data URL. */
export async function coverImage(bytes: Uint8Array): Promise<string | null> {
  try {
    const buf = await sharp(Buffer.from(bytes)).resize(COVER_PHOTO.width, COVER_PHOTO.height, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
