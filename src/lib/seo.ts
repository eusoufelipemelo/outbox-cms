// Checklist de SEO do editor. Puro (sem DOM): roda no cliente a cada edição e no servidor se preciso.

import { countWords, slugify, stripHtml } from "@/lib/utils";

export const SEO_TITLE_MAX = 60;
export const SEO_TITLE_MIN = 30;
export const SEO_DESCRIPTION_MIN = 140;
export const SEO_DESCRIPTION_MAX = 160;
export const MIN_WORDS = 600;

export interface SeoInput {
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  excerpt?: string | null;
  slug: string;
  focusKeyword?: string | null;
  html: string;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  /** Resposta direta (GEO): aparece no topo do artigo, então também conta como abertura. */
  answerSummary?: string | null;
}

export type SeoCheckId =
  | "keyword-title"
  | "keyword-intro"
  | "keyword-heading"
  | "keyword-description"
  | "keyword-slug"
  | "length"
  | "headings"
  | "image-alt"
  | "title-length"
  | "description-length";

export interface SeoCheck {
  id: SeoCheckId;
  ok: boolean;
  /** Depende da palavra-chave foco. */
  keyword: boolean;
  /** Frase curta do que foi verificado. */
  label: string;
  /** O que fazer quando não atende. */
  hint: string;
}

export interface SeoReport {
  checks: SeoCheck[];
  score: number;
  total: number;
  hasKeyword: boolean;
  words: number;
  /** Título e descrição efetivos (com os fallbacks que os sites usam). */
  effectiveTitle: string;
  effectiveDescription: string;
}

/** minúsculas, sem acento, espaços normalizados — para comparar palavra-chave. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Texto puro de um trecho de HTML (sem tags, entidades comuns decodificadas). */
export function textOf(html: string): string {
  return decodeEntities(stripHtml(html));
}

function includesKeyword(haystack: string, keyword: string): boolean {
  if (!keyword) return false;
  return normalizeText(haystack).includes(keyword);
}

function firstParagraph(html: string): string {
  const match = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return match ? textOf(match[1]) : "";
}

/** Texto de cada subtítulo de um nível (2 = H2). */
export function headings(html: string, level: number): string[] {
  const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
  return [...html.matchAll(re)].map((m) => textOf(m[1]));
}

function imagesWithoutAlt(html: string): number {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  return imgs.filter((tag) => {
    const alt = tag.match(/\balt\s*=\s*("([^"]*)"|'([^']*)')/i);
    const value = alt ? (alt[2] ?? alt[3] ?? "") : "";
    return value.trim() === "";
  }).length;
}

export function seoReport(input: SeoInput): SeoReport {
  const keyword = normalizeText(input.focusKeyword ?? "");
  const hasKeyword = keyword.length > 0;
  const effectiveTitle = (input.seoTitle || input.title || "").trim();
  const effectiveDescription = (input.seoDescription || input.excerpt || "").trim();
  const words = countWords(input.html);
  const h2s = headings(input.html, 2);
  const missingAlt = imagesWithoutAlt(input.html) + (input.coverImageUrl && !input.coverImageAlt?.trim() ? 1 : 0);
  const kwSlug = slugify(input.focusKeyword ?? "");

  const titleLen = effectiveTitle.length;
  const descLen = effectiveDescription.length;

  const checks: SeoCheck[] = [
    {
      id: "keyword-title",
      keyword: true,
      ok: hasKeyword && (includesKeyword(input.title, keyword) || includesKeyword(effectiveTitle, keyword)),
      label: "Palavra-chave no título",
      hint: "Inclua a palavra-chave foco no título, de preferência no começo.",
    },
    {
      id: "keyword-intro",
      keyword: true,
      ok:
        hasKeyword &&
        (includesKeyword(firstParagraph(input.html), keyword) || includesKeyword(input.answerSummary ?? "", keyword)),
      label: "Palavra-chave na abertura",
      hint: "Use a palavra-chave foco na resposta direta ou logo no primeiro parágrafo.",
    },
    {
      id: "keyword-heading",
      keyword: true,
      ok: hasKeyword && [...h2s, ...headings(input.html, 3)].some((h) => includesKeyword(h, keyword)),
      label: "Palavra-chave em um subtítulo",
      hint: "Coloque a palavra-chave foco em pelo menos um subtítulo (H2 ou H3).",
    },
    {
      id: "keyword-description",
      keyword: true,
      ok: hasKeyword && includesKeyword(effectiveDescription, keyword),
      label: "Palavra-chave na meta descrição",
      hint: "Escreva a meta descrição mencionando a palavra-chave foco.",
    },
    {
      id: "keyword-slug",
      keyword: true,
      ok: hasKeyword && kwSlug.length > 0 && input.slug.includes(kwSlug),
      label: "Palavra-chave no endereço",
      hint: "Ajuste o slug para conter a palavra-chave foco.",
    },
    {
      id: "length",
      keyword: false,
      ok: words >= MIN_WORDS,
      label: `Pelo menos ${MIN_WORDS} palavras`,
      hint:
        words === 0
          ? `Escreva o artigo: textos com ${MIN_WORDS} palavras ou mais costumam ranquear melhor.`
          : `Faltam ${MIN_WORDS - words} palavras para chegar a ${MIN_WORDS}. Aprofunde algum tópico.`,
    },
    {
      id: "headings",
      keyword: false,
      ok: h2s.length > 0,
      label: "Texto dividido com subtítulos",
      hint: "Divida o texto com subtítulos H2 para facilitar a leitura.",
    },
    {
      id: "image-alt",
      keyword: false,
      ok: missingAlt === 0,
      label: "Imagens com texto alternativo",
      hint:
        missingAlt === 1
          ? "Uma imagem está sem texto alternativo. Descreva o que ela mostra."
          : `${missingAlt} imagens estão sem texto alternativo. Descreva o que cada uma mostra.`,
    },
    {
      id: "title-length",
      keyword: false,
      ok: titleLen >= SEO_TITLE_MIN && titleLen <= SEO_TITLE_MAX,
      label: `Título com até ${SEO_TITLE_MAX} caracteres`,
      hint:
        titleLen === 0
          ? "Dê um título ao artigo."
          : titleLen > SEO_TITLE_MAX
            ? `O título para o Google tem ${titleLen} caracteres. Encurte o título SEO para até ${SEO_TITLE_MAX}.`
            : `O título para o Google tem só ${titleLen} caracteres. Use entre ${SEO_TITLE_MIN} e ${SEO_TITLE_MAX}.`,
    },
    {
      id: "description-length",
      keyword: false,
      ok: descLen >= SEO_DESCRIPTION_MIN && descLen <= SEO_DESCRIPTION_MAX,
      label: `Meta descrição entre ${SEO_DESCRIPTION_MIN} e ${SEO_DESCRIPTION_MAX} caracteres`,
      hint:
        descLen === 0
          ? "Escreva a meta descrição: é o texto que aparece abaixo do título no Google."
          : descLen > SEO_DESCRIPTION_MAX
            ? `A meta descrição tem ${descLen} caracteres. Corte para até ${SEO_DESCRIPTION_MAX}.`
            : `A meta descrição tem ${descLen} caracteres. Complete até ${SEO_DESCRIPTION_MIN} ou mais.`,
    },
  ];

  return {
    checks,
    score: checks.filter((c) => c.ok).length,
    total: checks.length,
    hasKeyword,
    words,
    effectiveTitle,
    effectiveDescription,
  };
}
