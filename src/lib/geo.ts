// Checklist de GEO (Generative Engine Optimization): o quanto o artigo está pronto para ser extraído
// e citado por mecanismos de resposta com IA (ChatGPT, Gemini, Perplexity, AI Overviews do Google).
// Puro (sem DOM, sem data atual implícita): roda no cliente a cada edição e em testes.

import type { ContentType, FaqItem } from "@/lib/types";
import { headings, normalizeText, textOf } from "@/lib/seo";

export const ANSWER_MIN_WORDS = 40;
export const ANSWER_MAX_WORDS = 60;
export const QUESTION_HEADINGS_MIN = 3;
export const PARAGRAPH_MAX_WORDS = 120;
export const TAKEAWAYS_MIN = 3;
export const TAKEAWAYS_MAX = 8;
export const FAQ_MIN = 3;
export const FAQ_MAX = 12;
export const FRESHNESS_DAYS = 365;

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "article", label: "Artigo" },
  { value: "howto", label: "Passo a passo" },
  { value: "guide", label: "Guia" },
  { value: "list", label: "Lista" },
  { value: "comparison", label: "Comparativo" },
  { value: "news", label: "Notícia" },
];

export function isContentType(value: unknown): value is ContentType {
  return typeof value === "string" && CONTENT_TYPES.some((t) => t.value === value);
}

export interface GeoInput {
  answerSummary?: string | null;
  focusKeyword?: string | null;
  /** Nomes que identificam o assunto além da palavra-chave: cliente, cidade, serviço. */
  entities?: string[];
  html: string;
  keyTakeaways?: string[];
  faq?: FaqItem[];
  sources?: { url?: string | null }[];
  authorName?: string | null;
  /** Especialista cadastrado no cliente de algum destino (sugestão de autoria). */
  expert?: { name: string; credentials?: string | null } | null;
  /** Quando a versão no ar foi enviada pela última vez (null = ainda não está no ar). */
  liveVersionAt?: string | null;
  /** Agora, em ms. Injetável para testes. */
  now: number;
}

export type GeoCheckId =
  | "answer-length"
  | "answer-entity"
  | "question-headings"
  | "short-sections"
  | "takeaways"
  | "faq"
  | "sources"
  | "concrete-data"
  | "author"
  | "freshness";

export interface GeoCheck {
  id: GeoCheckId;
  ok: boolean;
  label: string;
  hint: string;
}

export interface GeoReport {
  checks: GeoCheck[];
  score: number;
  total: number;
  answerWords: number;
}

/** Palavras de um texto puro. */
export function countPlainWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

const QUESTION_STARTS = [
  "como",
  "o que",
  "qual",
  "quais",
  "quando",
  "por que",
  "porque",
  "quanto",
  "quantos",
  "quantas",
  "onde",
  "quem",
];

/** Subtítulo em forma de pergunta: termina com "?" ou começa com Como, O que, Qual, Quando, Por que, Quanto, Onde. */
export function isQuestionHeading(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  const n = normalizeText(t);
  return QUESTION_STARTS.some((q) => n === q || n.startsWith(`${q} `));
}

/** Palavras de cada parágrafo (<p>) do HTML. */
export function paragraphWordCounts(html: string): number[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => countPlainWords(textOf(m[1])));
}

/** Números no texto (preços, prazos, percentuais, anos, medidas). */
export function countNumbers(text: string): number {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).length;
}

export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isCompleteFaq(item: FaqItem): boolean {
  return Boolean(item.question.trim() && item.answer.trim());
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function geoReport(input: GeoInput): GeoReport {
  const answer = (input.answerSummary ?? "").trim();
  const answerWords = countPlainWords(answer);
  const answerNorm = normalizeText(answer);
  const keyword = normalizeText(input.focusKeyword ?? "");
  const entities = [...new Set((input.entities ?? []).map(normalizeText).filter((e) => e.length > 1))];
  const bodyText = textOf(input.html);
  const hasBody = bodyText.length > 0;

  const questionH2 = headings(input.html, 2).filter(isQuestionHeading).length;
  const longParagraphs = paragraphWordCounts(input.html).filter((w) => w > PARAGRAPH_MAX_WORDS).length;
  const takeaways = (input.keyTakeaways ?? []).filter((t) => t.trim()).length;
  const faqs = (input.faq ?? []).filter(isCompleteFaq).length;
  const sources = (input.sources ?? []).filter((s) => isHttpUrl(s.url)).length;
  const numbers = countNumbers(bodyText);
  const author = (input.authorName ?? "").trim();
  const expert = input.expert?.name.trim() ? input.expert : null;

  const liveMs = input.liveVersionAt ? Date.parse(input.liveVersionAt) : NaN;
  const ageDays = Number.isFinite(liveMs) ? Math.floor((input.now - liveMs) / 86_400_000) : null;

  const mentionsEntity =
    answer.length > 0 && ((keyword.length > 0 && answerNorm.includes(keyword)) || entities.some((e) => answerNorm.includes(e)));

  const checks: GeoCheck[] = [
    {
      id: "answer-length",
      ok: answerWords >= ANSWER_MIN_WORDS && answerWords <= ANSWER_MAX_WORDS,
      label: `Resposta direta com ${ANSWER_MIN_WORDS} a ${ANSWER_MAX_WORDS} palavras`,
      hint:
        answerWords === 0
          ? "Escreva a resposta direta no topo: responda a pergunta do título em 40 a 60 palavras."
          : answerWords < ANSWER_MIN_WORDS
            ? `A resposta direta tem ${plural(answerWords, "palavra", "palavras")}. Complete até ${ANSWER_MIN_WORDS} com um dado ou exemplo.`
            : `A resposta direta tem ${answerWords} palavras. Corte para até ${ANSWER_MAX_WORDS}: IAs citam trechos curtos.`,
    },
    {
      id: "answer-entity",
      ok: mentionsEntity,
      label: "Resposta cita a palavra-chave ou a empresa",
      hint:
        !keyword && entities.length === 0
          ? "Defina a palavra-chave foco (em SEO) para conferir se a resposta direta fala do assunto certo."
          : "Cite na resposta direta a palavra-chave foco ou o nome da empresa, para a IA saber de quem e do que se trata.",
    },
    {
      id: "question-headings",
      ok: questionH2 >= QUESTION_HEADINGS_MIN,
      label: `Pelo menos ${QUESTION_HEADINGS_MIN} subtítulos em forma de pergunta`,
      hint:
        questionH2 === 0
          ? "Escreva subtítulos H2 como perguntas que o leitor faria (Como, O que, Quanto custa…)."
          : `Só ${plural(questionH2, "subtítulo H2 é pergunta", "subtítulos H2 são perguntas")}. Transforme mais ${QUESTION_HEADINGS_MIN - questionH2} em perguntas.`,
    },
    {
      id: "short-sections",
      ok: hasBody && longParagraphs === 0,
      label: `Parágrafos com até ${PARAGRAPH_MAX_WORDS} palavras`,
      hint: !hasBody
        ? "Escreva o texto em parágrafos curtos, cada um com uma ideia completa."
        : longParagraphs === 1
          ? `Um parágrafo passa de ${PARAGRAPH_MAX_WORDS} palavras. Divida em trechos que se entendam sozinhos.`
          : `${longParagraphs} parágrafos passam de ${PARAGRAPH_MAX_WORDS} palavras. Divida em trechos que se entendam sozinhos.`,
    },
    {
      id: "takeaways",
      ok: takeaways >= TAKEAWAYS_MIN,
      label: `Pelo menos ${TAKEAWAYS_MIN} pontos principais`,
      hint:
        takeaways === 0
          ? `Resuma o artigo em ${TAKEAWAYS_MIN} a 5 pontos principais, uma frase cada.`
          : `${TAKEAWAYS_MIN - takeaways === 1 ? "Falta" : "Faltam"} ${plural(TAKEAWAYS_MIN - takeaways, "ponto principal", "pontos principais")} para chegar a ${TAKEAWAYS_MIN}.`,
    },
    {
      id: "faq",
      ok: faqs >= FAQ_MIN,
      label: `Pelo menos ${FAQ_MIN} perguntas frequentes`,
      hint:
        faqs === 0
          ? `Adicione ${FAQ_MIN} ou mais perguntas frequentes com respostas curtas. Elas viram dados estruturados de FAQ.`
          : `${FAQ_MIN - faqs === 1 ? "Falta" : "Faltam"} ${plural(FAQ_MIN - faqs, "pergunta respondida", "perguntas respondidas")} para chegar a ${FAQ_MIN}.`,
    },
    {
      id: "sources",
      ok: sources >= 1,
      label: "Pelo menos uma fonte com link",
      hint: "Cite ao menos uma fonte confiável com o endereço (órgão oficial, pesquisa, norma). Fontes reais aumentam a confiança das IAs.",
    },
    {
      id: "concrete-data",
      ok: numbers > 0,
      label: "Dados concretos no texto",
      hint: hasBody
        ? "Inclua números concretos: preços, prazos, medidas, percentuais ou datas. IAs preferem citar fatos verificáveis."
        : "Escreva o texto com números concretos: preços, prazos, medidas ou datas.",
    },
    {
      id: "author",
      ok: author.length > 0,
      label: "Autor ou especialista definido",
      hint: expert
        ? `Defina o autor. O cliente tem especialista cadastrado: ${expert.name}${expert.credentials ? `, ${expert.credentials}` : ""}.`
        : "Defina o autor em Detalhes. Um especialista com credenciais passa mais confiança para buscadores e IAs.",
    },
    {
      id: "freshness",
      ok: ageDays === null || ageDays <= FRESHNESS_DAYS,
      label: "Data de atualização recente",
      hint:
        ageDays === null
          ? "Publique para registrar a data."
          : `A versão no ar foi enviada há ${plural(ageDays, "dia", "dias")}. Revise dados e fontes e atualize o artigo nos sites.`,
    },
  ];

  return { checks, score: checks.filter((c) => c.ok).length, total: checks.length, answerWords };
}
