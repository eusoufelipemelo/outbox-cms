import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDiagnosticByToken, type Diagnostic } from "@/lib/data/diagnostics";
import { request } from "@/lib/delivery/http";
import { findOgImage } from "@/lib/diagnostics/site-checks";
import { SCORE_LABELS, scoreWord } from "@/lib/diagnostics/scoring";

/** Prévia do link do relatório no WhatsApp: nome do cliente, nota e a imagem do próprio site. */

export const alt = "Diagnóstico de presença digital feito pela OutBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const root = process.cwd();
const fonts = Promise.all([
  readFile(join(root, "src/assets/fonts/Archivo-Medium.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-Bold.ttf")),
  readFile(join(root, "src/assets/fonts/Archivo-ExtraBold-Expanded.ttf")),
]);
const logo = readFile(join(root, "public/brand/logo-horizontal-branco.svg")).then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`);

const color = (v: number | null) => (v === null ? "#7e818a" : v >= 90 ? "#52c98f" : v >= 50 ? "#e8b85a" : "#ff7b6e");

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Baixa a imagem do site do cliente (só PNG/JPEG, até 3 MB) como data URL. */
async function clientImage(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await request(src, { timeoutMs: 6000, retries: 0 });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return reportOgImage(await getDiagnosticByToken(token));
}

export async function reportOgImage(d: Diagnostic | null) {
  const [[medium, bold, display], logoSrc] = await Promise.all([fonts, logo]);

  const name = d ? d.business_name || d.business?.name || host(d.url) : "Diagnóstico de presença digital";
  const overall = d?.scores?.overall ?? null;
  const ogSrc = d ? (d.site_checks?.ogImage !== undefined ? d.site_checks.ogImage : await findOgImage(d.url).catch(() => null)) : null;
  const shot = await clientImage(ogSrc);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000", color: "#fff", fontFamily: "Archivo", padding: 56, position: "relative" }}>
        {/* entalhe laranja da marca */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 72, height: 72, borderTop: "10px solid #f15532", borderLeft: "10px solid #f15532" }} />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: shot ? 40 : 0 }}>
          <img src={logoSrc} width={170} height={42} alt="" />
          <div style={{ display: "flex", marginTop: 44, fontSize: 26, color: "#a4a7ae", fontWeight: 500 }}>Diagnóstico de presença digital</div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontFamily: "Archivo Display",
              fontSize: name.length > 30 ? 46 : name.length > 16 ? 54 : 64,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxHeight: 140,
              wordBreak: "break-word",
              overflow: "hidden",
            }}
          >
            {name}
          </div>
          {d && name !== host(d.url) ? <div style={{ display: "flex", marginTop: 12, fontSize: 26, color: "#a4a7ae", fontWeight: 500 }}>{host(d.url)}</div> : null}

          <div style={{ display: "flex", marginTop: "auto", gap: 14 }}>
            {SCORE_LABELS.map((s) => {
              const v = d?.scores?.[s.key] ?? null;
              return (
                <div key={s.key} style={{ display: "flex", flexDirection: "column", border: "2px solid #2b2d32", borderRadius: 16, padding: "12px 16px", minWidth: 130 }}>
                  <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: color(v) }}>{v ?? "—"}</div>
                  <div style={{ display: "flex", fontSize: 18, color: "#a4a7ae", fontWeight: 500 }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: shot ? "stretch" : "flex-end", justifyContent: shot ? "space-between" : "flex-end", width: 420 }}>
          {shot ? (
            <img src={shot} width={420} height={220} alt="" style={{ objectFit: "cover", borderRadius: 18, border: "2px solid #2b2d32" }} />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div style={{ display: "flex", fontFamily: "Archivo Display", fontSize: 150, lineHeight: 1, color: color(overall) }}>{overall ?? "—"}</div>
              <div style={{ display: "flex", fontSize: 40, color: "#7e818a", fontWeight: 700, marginLeft: 6 }}>/100</div>
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#e4e5e8", fontWeight: 500, marginTop: 6 }}>Nota geral: {scoreWord(overall).toLowerCase()}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo", data: medium, weight: 500, style: "normal" },
        { name: "Archivo", data: bold, weight: 700, style: "normal" },
        { name: "Archivo Display", data: display, weight: 800, style: "normal" },
      ],
    },
  );
}
