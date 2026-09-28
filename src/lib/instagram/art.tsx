import "server-only";
/* eslint-disable @next/next/no-img-element -- JSX desenhado em imagem pelo next/og, não é página */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Artes do Instagram desenhadas pelo CMS (a API só recebe a imagem pronta):
 * capa com a foto do artigo, slides de conteúdo e fechamento, na paleta e no tom do cliente.
 * Saem em JPEG, único formato que o Instagram aceita pela API.
 */

export type Brand = { name: string; handle: string | null; site: string | null; color: string; dark: boolean };
export type Slide = { title: string; text: string };

const root = process.cwd();
const fonts = Promise.all([
  readFile(join(root, "src/assets/fonts/Archivo-Medium.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-Bold.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-ExtraBold-Expanded.ttf")),
]);

async function render(node: React.ReactElement, width: number, height: number): Promise<Buffer> {
  const [medium, bold, display] = await fonts;
  const png = await new ImageResponse(node, {
    width,
    height,
    fonts: [
      { name: "Archivo", data: medium, weight: 500, style: "normal" },
      { name: "Archivo", data: bold, weight: 700, style: "normal" },
      { name: "Display", data: display, weight: 800, style: "normal" },
    ],
  }).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** Texto legível sobre a cor da marca (preto ou branco pelo contraste). */
function onColor(hex: string): string {
  const m = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#0b0b0b" : "#ffffff";
}

const palette = (b: Brand) => ({
  bg: b.dark ? "#0e0e10" : "#f6f5f2",
  ink: b.dark ? "#ffffff" : "#111111",
  muted: b.dark ? "#a4a7ae" : "#5c5f68",
});

/** Foto de fundo como data URL (o renderizador não baixa arquivos grandes sozinho). */
export async function photoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** 1ª lâmina: foto do artigo, título grande e a faixa na cor da marca. */
export function coverSlide(b: Brand, title: string, photo: string | null): Promise<Buffer> {
  const size = title.length > 70 ? 64 : title.length > 45 ? 76 : 88;
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0e0e10", fontFamily: "Archivo" }}>
      {photo ? <img src={photo} width={1080} height={1350} alt="" style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} /> : null}
      <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1350, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.9) 80%)" }} />
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 96, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", width: 120, height: 14, background: b.color, marginBottom: 36 }} />
        <div style={{ display: "flex", fontFamily: "Display", fontSize: size, lineHeight: 1.02, color: "#ffffff", letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36, fontSize: 30, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
          <span>{b.handle ? `@${b.handle}` : b.name}</span>
          <span>Arraste para o lado</span>
        </div>
      </div>
    </div>,
    1080,
    1350,
  );
}

/** Lâminas do meio: número da etapa, título e texto curto. */
export function contentSlide(b: Brand, s: Slide, index: number, total: number): Promise<Buffer> {
  const p = palette(b);
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: p.bg, padding: 96, fontFamily: "Archivo" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontFamily: "Display", fontSize: 150, lineHeight: 1, color: b.color }}>{String(index).padStart(2, "0")}</div>
        <div style={{ display: "flex", fontSize: 28, color: p.muted, fontWeight: 500 }}>
          {index}/{total}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 72, fontFamily: "Display", fontSize: s.title.length > 40 ? 64 : 76, lineHeight: 1.05, color: p.ink, letterSpacing: "-0.02em" }}>
        {s.title}
      </div>
      <div style={{ display: "flex", marginTop: 44, fontSize: 40, lineHeight: 1.42, color: p.ink, fontWeight: 500, opacity: 0.88 }}>{s.text}</div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 28, color: p.muted, fontWeight: 500 }}>{b.handle ? `@${b.handle}` : b.name}</div>
    </div>,
    1080,
    1350,
  );
}

/** Última lâmina: chamada para o artigo completo. */
export function ctaSlide(b: Brand, text: string): Promise<Buffer> {
  const fg = onColor(b.color);
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: b.color, padding: 96, fontFamily: "Archivo" }}>
      <div style={{ display: "flex", fontFamily: "Display", fontSize: 92, lineHeight: 1.02, color: fg, letterSpacing: "-0.02em" }}>{text}</div>
      <div style={{ display: "flex", marginTop: 56, fontSize: 40, color: fg, fontWeight: 700 }}>Artigo completo no link da bio</div>
      {b.site ? <div style={{ display: "flex", marginTop: 16, fontSize: 34, color: fg, fontWeight: 500, opacity: 0.85 }}>{b.site}</div> : null}
    </div>,
    1080,
    1350,
  );
}

/** Story 9:16: foto, título e o convite para o post. */
export function storyFrame(b: Brand, title: string, photo: string | null): Promise<Buffer> {
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0e0e10", fontFamily: "Archivo" }}>
      {photo ? <img src={photo} width={1080} height={1920} alt="" style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} /> : null}
      <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.92) 78%)" }} />
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 260, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignSelf: "flex-start", background: b.color, color: onColor(b.color), fontSize: 32, fontWeight: 700, padding: "12px 24px", borderRadius: 999 }}>
          Novo no blog
        </div>
        <div style={{ display: "flex", marginTop: 36, fontFamily: "Display", fontSize: title.length > 60 ? 70 : 84, lineHeight: 1.03, color: "#ffffff", letterSpacing: "-0.02em" }}>
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 36, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>Veja o post no perfil</div>
      </div>
    </div>,
    1080,
    1920,
  );
}
