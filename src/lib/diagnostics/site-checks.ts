import "server-only";
import { readBody, request } from "@/lib/delivery/http";

/** Leitura direta do site: fundamentos de SEO, conversão e preparo para buscas com IA (GEO). */

export type Check = { id: string; group: "seo" | "geo" | "conversao"; label: string; ok: boolean; detail: string };

export type SiteChecks = {
  ok: boolean;
  error?: string;
  finalUrl?: string;
  title?: string | null;
  description?: string | null;
  /** Imagem de compartilhamento do próprio site (og:image), em URL absoluta. */
  ogImage?: string | null;
  checks: Check[];
  /** Frequência do blog medida pelo sitemap (datas de atualização dos artigos). */
  blogActivity?: { posts: number; recent: number | null; lastPost: string | null };
};

const POST_PATH = /\/(blog|artigos?|conteudos?|noticias|posts?|insights|materias)\/[^/?#]+/i;

function sitemapEntries(xml: string): { loc: string; lastmod: string | null }[] {
  return [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
    loc: m[2].match(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+)/i)?.[1]?.trim() ?? "",
    lastmod: m[2].match(/<lastmod>\s*([^<]+)/i)?.[1]?.trim() ?? null,
  }));
}

/** Conta artigos do blog no sitemap (segue até 4 sitemaps filhos) e quantos mudaram nos últimos 90 dias. */
async function blogActivity(sitemapXml: string): Promise<SiteChecks["blogActivity"]> {
  let entries = sitemapEntries(sitemapXml);
  if (/<sitemapindex/i.test(sitemapXml)) {
    const children = entries
      .map((e) => e.loc)
      .filter(Boolean)
      .sort((a, b) => Number(/post|blog|artigo/i.test(b)) - Number(/post|blog|artigo/i.test(a)))
      .slice(0, 4);
    const xmls = await Promise.all(children.map((u) => fetchText(u)));
    entries = xmls.flatMap((x) => (x && x.status < 400 ? sitemapEntries(x.text) : []));
  }
  const posts = entries.filter((e) => {
    try {
      return POST_PATH.test(new URL(e.loc).pathname);
    } catch {
      return false;
    }
  });
  const dates = posts.map((p) => (p.lastmod ? Date.parse(p.lastmod) : NaN)).filter((d) => Number.isFinite(d));
  const since = Date.now() - 90 * 86_400_000;
  return {
    posts: posts.length,
    recent: dates.length ? dates.filter((d) => d >= since).length : null,
    lastPost: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
  };
}

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"];

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "").trim() : null;
}

function meta(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const n = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (n === key) return attr(tag, "content");
  }
  return null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function schemaTypes(html: string): string[] {
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
      for (const v of t[1].matchAll(/"([^"]+)"/g)) types.add(v[1]);
    }
  }
  return [...types];
}

async function fetchText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await request(url, { timeoutMs: 12_000, retries: 1, headers: { accept: "text/html,*/*" } });
    const { text } = await readBody(res, 600_000);
    return { status: res.status, text };
  } catch {
    return null;
  }
}

/** Grupos de user-agent do robots.txt que bloqueiam o site inteiro. */
function blockedBots(robots: string): string[] {
  const blocked: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const key = k?.toLowerCase().trim();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (key === "disallow" && value === "/") blocked.push(...agents);
    }
  }
  return AI_BOTS.filter((b) => blocked.includes(b.toLowerCase()) || blocked.includes("*"));
}

export async function checkSite(url: string): Promise<SiteChecks> {
  const home = await fetchText(url);
  if (!home) return { ok: false, error: "Não foi possível abrir o site. Confira se o endereço está certo e no ar.", checks: [] };
  if (home.status >= 400) return { ok: false, error: `O site respondeu com erro ${home.status}.`, checks: [] };

  const origin = new URL(url).origin;
  const html = home.text;
  const [robots, sitemap, llms] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/sitemap.xml`),
    fetchText(`${origin}/llms.txt`),
  ]);

  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleRaw ? decode(titleRaw) : null;
  const description = meta(html, "description");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]*>/g, " "))).filter(Boolean);
  const canonical = (html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i) ?? [])[0];
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i)?.[1] ?? null;
  const viewport = meta(html, "viewport");
  const ogImage = meta(html, "og:image");
  const ogTitle = meta(html, "og:title");
  const types = schemaTypes(html);
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  const whatsapp = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
  const tel = /href\s*=\s*["']tel:/i.test(html);
  const activity = sitemap && sitemap.status < 400 ? await blogActivity(sitemap.text).catch(() => undefined) : undefined;
  const blogLink = /href\s*=\s*["'][^"']*\/(blog|artigos|conteudos?|noticias)(\/|["'?#])/i.test(html);
  const blog = blogLink || (activity?.posts ?? 0) > 0;
  const words = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")).split(" ").length;
  const robotsText = robots && robots.status < 400 ? robots.text : "";
  const blocked = blockedBots(robotsText);
  const hasSitemap = Boolean(
    (sitemap && sitemap.status < 400 && /<(urlset|sitemapindex)/i.test(sitemap.text)) || /^\s*sitemap:/im.test(robotsText),
  );
  const hasLlms = Boolean(llms && llms.status < 400 && llms.text.trim().length > 20 && !/<html/i.test(llms.text));
  const business = types.some((t) => /LocalBusiness|Organization|Store|Service|Professional|Clinic|Dentist|Attorney|Restaurant|Physician|Contractor/i.test(t));
  const faq = types.includes("FAQPage");
  const https = new URL(url).protocol === "https:";
  const noindex = /noindex/i.test(meta(html, "robots") ?? "");

  const checks: Check[] = [
    { id: "https", group: "seo", label: "Site seguro (HTTPS)", ok: https, detail: https ? "Cadeado ativo." : "O site abre sem cadeado de segurança." },
    { id: "index", group: "seo", label: "Liberado para o Google", ok: !noindex, detail: noindex ? "A página está marcada como noindex e não aparece no Google." : "A página pode ser indexada." },
    { id: "title", group: "seo", label: "Título da página", ok: Boolean(title && title.length >= 20 && title.length <= 65), detail: title ? `"${title.slice(0, 80)}" (${title.length} caracteres; ideal 30 a 60).` : "Sem título." },
    { id: "description", group: "seo", label: "Descrição para o Google", ok: Boolean(description && description.length >= 70 && description.length <= 170), detail: description ? `${description.length} caracteres (ideal 120 a 160).` : "Sem meta descrição: o Google escolhe um trecho qualquer." },
    { id: "h1", group: "seo", label: "Título principal (H1) único", ok: h1s.length === 1, detail: h1s.length === 0 ? "Nenhum H1 na página inicial." : h1s.length === 1 ? `"${h1s[0].slice(0, 80)}"` : `${h1s.length} títulos H1 disputando a mesma página.` },
    { id: "canonical", group: "seo", label: "Endereço canônico", ok: Boolean(canonical), detail: canonical ? "Definido." : "Sem canonical: risco de conteúdo duplicado." },
    { id: "mobile", group: "seo", label: "Preparado para celular", ok: Boolean(viewport), detail: viewport ? "Viewport configurado." : "Sem viewport: o site não se adapta bem ao celular." },
    { id: "lang", group: "seo", label: "Idioma declarado", ok: Boolean(lang), detail: lang ? `Idioma ${lang}.` : "Idioma não declarado." },
    { id: "sitemap", group: "seo", label: "Mapa do site (sitemap)", ok: hasSitemap, detail: hasSitemap ? "Encontrado." : "Sem sitemap.xml: o Google demora mais para achar as páginas." },
    { id: "alt", group: "seo", label: "Imagens descritas (alt)", ok: imgs.length === 0 || noAlt / imgs.length <= 0.2, detail: imgs.length ? `${noAlt} de ${imgs.length} imagens sem descrição.` : "Sem imagens na página inicial." },
    { id: "og", group: "seo", label: "Prévia ao compartilhar", ok: Boolean(ogImage && ogTitle), detail: ogImage && ogTitle ? "Imagem e título de compartilhamento definidos." : "Sem imagem/título para WhatsApp e redes sociais." },
    { id: "content", group: "seo", label: "Conteúdo na página inicial", ok: words >= 300, detail: `Cerca de ${words} palavras (recomendado 300 ou mais).` },
    { id: "schema", group: "geo", label: "Dados estruturados da empresa", ok: business, detail: types.length ? `Tipos encontrados: ${types.slice(0, 6).join(", ")}.` : "Sem Schema.org: Google e IAs não entendem quem é a empresa." },
    { id: "faq", group: "geo", label: "Perguntas frequentes marcadas", ok: faq, detail: faq ? "FAQPage encontrado." : "Sem FAQ estruturado: perde espaço em respostas de IA." },
    { id: "llms", group: "geo", label: "Arquivo llms.txt", ok: hasLlms, detail: hasLlms ? "Encontrado." : "Sem llms.txt: o guia do site para assistentes de IA." },
    { id: "bots", group: "geo", label: "Acesso liberado para IAs", ok: blocked.length === 0, detail: blocked.length ? `Bloqueados no robots.txt: ${blocked.join(", ")}.` : "ChatGPT, Claude, Perplexity e Gemini podem ler o site." },
    { id: "blog", group: "geo", label: "Blog com conteúdo próprio", ok: blog, detail: blog ? "Link para blog/artigos encontrado." : "Sem blog: não há conteúdo para ser citado por IAs e pelo Google." },
    { id: "whatsapp", group: "conversao", label: "Botão de WhatsApp", ok: whatsapp, detail: whatsapp ? "Encontrado." : "Sem link direto para WhatsApp." },
    { id: "tel", group: "conversao", label: "Telefone clicável", ok: tel, detail: tel ? "Encontrado." : "Telefone não é clicável no celular." },
  ];

  let ogImageUrl: string | null = null;
  try {
    ogImageUrl = ogImage ? new URL(decode(ogImage), url).toString() : null;
  } catch {
    ogImageUrl = null;
  }

  return { ok: true, finalUrl: url, title, description, ogImage: ogImageUrl, checks, blogActivity: activity };
}

/** og:image do site (para diagnósticos antigos, que não guardaram a imagem). */
export async function findOgImage(url: string): Promise<string | null> {
  const home = await fetchText(url);
  if (!home || home.status >= 400) return null;
  const og = meta(home.text, "og:image") ?? meta(home.text, "twitter:image");
  try {
    return og ? new URL(decode(og), url).toString() : null;
  } catch {
    return null;
  }
}
