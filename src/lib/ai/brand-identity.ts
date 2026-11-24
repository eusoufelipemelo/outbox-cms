import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { generate, aiEnabled } from "@/lib/ai/server";
import { IMAGE_MOODS } from "@/lib/ai/visual";

/**
 * Identidade visual das imagens de um cliente, montada a partir do cadastro (segmento, sobre,
 * serviços, público, cidade) e do site dele (cores do CSS, cor do tema, título e descrição).
 * Vira os campos "Cor da marca", "Clima das imagens" e "Estilo das imagens" do cadastro.
 */

export type IdentitySuggestion = {
  brand_color: string | null;
  image_mood: (typeof IMAGE_MOODS)[number]["value"];
  image_style: string;
  /** Cores achadas no site, para mostrar de onde veio a sugestão. */
  siteColors: string[];
  siteUrl: string | null;
};

type ClientRow = {
  name: string;
  segment: string | null;
  about: string | null;
  services: string[] | null;
  audience: string | null;
  city: string | null;
  state: string | null;
  tone_of_voice: string | null;
  brand_color: string | null;
};

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

function normHex(h: string): string {
  const m = h.replace("#", "").toLowerCase();
  return `#${m.length === 3 ? m.split("").map((c) => c + c).join("") : m}`;
}

/** Saturação e luminosidade: tira brancos, pretos e cinzas, que não dizem nada da marca. */
function isBrandish(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.12) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  return s > 0.25 && l > 0.12 && l < 0.88;
}

async function fetchText(url: string, max = 600_000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; OutBoxCMS/1.0)", accept: "text/html,text/css,*/*" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return "";
    return (await res.text()).slice(0, max);
  } catch {
    return "";
  }
}

const meta = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? null;

/** Lê o site: cores mais usadas no CSS (fora os neutros), cor do tema, título e descrição. */
async function readSite(url: string): Promise<{ colors: string[]; themeColor: string | null; title: string | null; description: string | null }> {
  const html = await fetchText(url);
  if (!html) return { colors: [], themeColor: null, title: null, description: null };
  const base = new URL(url);
  const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
    .filter((h): h is string => Boolean(h))
    .map((h) => {
      try {
        return new URL(h, base).toString();
      } catch {
        return null;
      }
    })
    .filter((h): h is string => Boolean(h) && new URL(h as string).host === base.host)
    .slice(0, 3);
  const css = (await Promise.all(sheets.map((s) => fetchText(s, 500_000)))).join("\n");
  const source = `${html}\n${css}`;

  const count = new Map<string, number>();
  for (const m of source.matchAll(HEX)) {
    const hex = normHex(m[0]);
    if (isBrandish(hex)) count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  for (const m of source.matchAll(RGB)) {
    const hex = `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("")}`;
    if (isBrandish(hex)) count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  const colors = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([hex]) => hex);
  const theme = meta(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  return {
    colors,
    themeColor: theme && /^#[0-9a-f]{3,6}$/i.test(theme) ? normHex(theme) : null,
    title: meta(html, /<title[^>]*>([^<]{1,200})<\/title>/i),
    description:
      meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i) ??
      meta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,400})["']/i),
  };
}

export async function suggestIdentity(clientId: string): Promise<IdentitySuggestion> {
  if (!aiEnabled()) throw new Error("A IA de texto está desligada. Configure a chave em Painel admin → Texto.");
  const [{ data: c }, { data: siteRows }] = await Promise.all([
    db().from("clients").select("name, segment, about, services, audience, city, state, tone_of_voice, brand_color").eq("id", clientId).maybeSingle(),
    db().from("sites").select("url, status").eq("client_id", clientId).order("created_at", { ascending: true }),
  ]);
  const client = c as ClientRow | null;
  if (!client) throw new Error("Cliente não encontrado.");
  const sites = (siteRows ?? []) as { url: string; status: string }[];
  const siteUrl = (sites.find((s) => s.status === "active") ?? sites[0])?.url ?? null;
  const site = siteUrl ? await readSite(siteUrl) : { colors: [], themeColor: null, title: null, description: null };
  const siteColors = [...new Set([site.themeColor, ...site.colors].filter((x): x is string => Boolean(x)))].slice(0, 6);
  const current = client.brand_color && /^#[0-9a-f]{6}$/i.test(client.brand_color) ? client.brand_color.toLowerCase() : null;

  const out = await generate(
    z.object({
      brand_color: z.string().describe("Cor principal da marca em hex (#rrggbb). Use a cor atual do cadastro se houver; senão escolha uma das cores do site. Vazio se nada servir."),
      image_mood: z.enum(["escuro", "claro", "colorido", "monocromatico", "auto"]).describe("Clima geral das fotos da marca."),
      image_style: z
        .string()
        .describe(
          "Direção de arte em português, 2 a 3 frases curtas, no máximo 450 caracteres (conte): paleta e onde a cor da marca aparece (material, objeto ou luz), tipo de luz, ambientes e materiais típicos do negócio, perfil das pessoas (público real da região) e enquadramento. Concreta, sem adjetivos vazios, sem texto na imagem.",
        ),
    }),
    {
      system:
        "Você é diretor de fotografia da agência OutBox. Define a identidade visual das fotos de cada cliente para que todas as capas de blog e posts de Instagram pareçam da mesma marca, com fotos reais e brasileiras, nunca de banco de imagens. Cada cliente precisa de uma direção própria, coerente com o segmento, o público e as cores do site.",
      user: `Cliente: ${client.name}
Segmento: ${client.segment ?? "não informado"}
Cidade: ${[client.city, client.state].filter(Boolean).join(" - ") || "não informada"}
Sobre: ${client.about ?? "não informado"}
Serviços: ${(client.services ?? []).join("; ") || "não informado"}
Público: ${client.audience ?? "não informado"}
Tom de voz: ${client.tone_of_voice ?? "não informado"}
Cor da marca no cadastro: ${current ?? "nenhuma"}
Site: ${siteUrl ?? "nenhum"}${site.title ? `\nTítulo do site: ${site.title}` : ""}${site.description ? `\nDescrição do site: ${site.description}` : ""}
Cores mais usadas no site (fora brancos, pretos e cinzas): ${siteColors.join(", ") || "não encontradas"}

Defina a identidade visual das fotos deste cliente.`,
    },
    { maxTokens: 1500, timeoutMs: 60_000, effort: "low", task: "apoio" },
  );

  // resposta sem frases (ex.: "natural-softly-lit-interior-photography") não serve como direção de arte
  const style = out.image_style.trim();
  if (style.split(/\s+/).length < 12) throw new Error(`A IA devolveu um estilo incompleto para ${client.name}. Tente de novo.`);
  const picked = out.brand_color?.trim().toLowerCase();
  const brand_color = current ?? (picked && /^#[0-9a-f]{6}$/.test(picked) ? picked : (siteColors[0] ?? null));
  return { brand_color, image_mood: out.image_mood, image_style: fitStyle(out.image_style), siteColors, siteUrl };
}

/** Cabe no campo (600 caracteres) sem cortar no meio da frase. */
function fitStyle(text: string, max = 600): string {
  const t = text.trim().replace(/\s+/g, " ");
  let out = t;
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    out = end > max * 0.5 ? cut.slice(0, end + 1).trim() : cut.slice(0, cut.lastIndexOf(" ")).trim();
  }
  // sempre termina como frase completa
  return /[.!?]$/.test(out) ? out : `${out.replace(/[;,:\s]+$/, "")}.`;
}
