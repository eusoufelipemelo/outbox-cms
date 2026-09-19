import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import type { ContentType, FaqItem, SourceItem } from "@/lib/types";
import { seoReport } from "@/lib/seo";
import { geoReport } from "@/lib/geo";
import type { AiAction, AiInput, AiOutput, AiStatus } from "./types";
import { CONTENT_TYPES, IDEA_INTENTS, type IdeaIntent } from "./labels";
import {
  draftPrompt,
  fixArticlePrompt,
  fullArticlePrompt,
  researchPrompt,
  geoPrompt,
  ideasPrompt,
  improvePrompt,
  outlinePrompt,
  seoPrompt,
  titlesPrompt,
  variationPrompt,
  type ClientContext,
  type Prompt,
  type ResearchNote,
  type VariationSite,
  type VariationSource,
} from "./prompts";
import { htmlForPrompt, plainText, sanitizeAiHtml } from "./sanitize";
import { DEFAULT_FULL_ARTICLE_WORDS, DEFAULT_IDEAS, DEFAULT_WORDS, MAX_HTML_CHARS } from "./validation";

// Assistente de escrita (Claude). Só roda no servidor, chamado por /api/ai.

/** Claude Sonnet 5: qualidade de redação próxima do topo de linha, com custo e latência de Sonnet. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export const AI_DISABLED_MESSAGE =
  "Assistente desligado: configure ANTHROPIC_API_KEY nas variáveis do Easypanel.";

export function aiModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiStatus(): AiStatus {
  return env.anthropicApiKey ? { enabled: true, model: aiModel() } : { enabled: false };
}

/** Erro já pronto para o usuário: mensagem pt-BR + status HTTP. */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// ---------------------------------------------------------------- cliente Anthropic

let anthropicClient: { key: string; client: Anthropic } | null = null;

function anthropic(): Anthropic {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) throw new AiError(AI_DISABLED_MESSAGE, 503);
  if (anthropicClient?.key !== apiKey) {
    // Retentativa feita à mão (só em sobrecarga), para não dobrar o tempo em timeouts.
    anthropicClient = { key: apiKey, client: new Anthropic({ apiKey, maxRetries: 0 }) };
  }
  return anthropicClient.client;
}

/** Modelos anteriores à geração 4.6 (e Haiku) não aceitam thinking adaptativo nem `effort`. */
function supportsAdaptive(model: string): boolean {
  return !/haiku|claude-3|-4-0|-4-1|-4-5|-4-2025/.test(model);
}

type Effort = "low" | "medium" | "high";
type CallConfig = { maxTokens: number; timeoutMs: number; effort: Effort };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isOverloaded(err: unknown): err is InstanceType<typeof Anthropic.APIError> {
  return err instanceof Anthropic.APIError && (err.status === 529 || err.type === "overloaded_error");
}

function retryDelayMs(err: InstanceType<typeof Anthropic.APIError>): number {
  const header = Number(err.headers?.get?.("retry-after"));
  if (Number.isFinite(header) && header > 0 && header <= 10) return header * 1000;
  return 2000 + Math.round(Math.random() * 1000);
}

async function generate<S extends z.ZodType>(
  schema: S,
  prompt: Prompt,
  cfg: CallConfig,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const model = aiModel();
  const adaptive = supportsAdaptive(model);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: cfg.maxTokens,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: {
      // Structured output: a resposta vem em JSON válido para o schema.
      format: zodOutputFormat(schema),
      ...(adaptive ? { effort: cfg.effort } : {}),
    },
    ...(adaptive ? { thinking: { type: "adaptive" as const } } : {}),
  };

  let message: Anthropic.Message | undefined;
  for (let attempt = 0; !message; attempt++) {
    try {
      message = await anthropic().messages.create(params, { timeout: cfg.timeoutMs, signal });
    } catch (err) {
      if (attempt === 0 && isOverloaded(err) && !signal?.aborted) {
        await sleep(retryDelayMs(err));
        continue;
      }
      throw err;
    }
  }

  if (message.stop_reason === "refusal") {
    throw new AiError("O assistente não aceitou este pedido. Reformule o tema ou a instrução e tente de novo.", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError(
      "A resposta ficou longa demais e veio cortada. Peça menos palavras ou envie um trecho menor.",
      422,
    );
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("O assistente devolveu uma resposta em formato inesperado. Tente de novo.", 502);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AiError("O assistente devolveu uma resposta incompleta. Tente de novo.", 502);
  }
  return parsed.data;
}

// ---------------------------------------------------------------- pós-processamento

/** Corta texto puro em `max` caracteres, na última palavra inteira. */
function clampText(value: string, max: number): string {
  const text = plainText(value).replace(/^["'“”]+|["'“”]+$/g, "");
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : text.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

function cleanTitle(value: string): string {
  return plainText(value)
    .replace(/^\s*(\d+[.)]|[-*•])\s+/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\.$/, "")
    .trim();
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= 75) return slug;
  return slug.slice(0, 76).replace(/-[^-]*$/, "") || slug.slice(0, 75);
}

function safeHtml(html: string): string {
  const clean = sanitizeAiHtml(html);
  if (!plainText(clean)) throw new AiError("O assistente devolveu um texto vazio. Tente de novo.", 502);
  return clean;
}

const ANCHOR = /<a href="([^"]*)">([\s\S]*?)<\/a>/g;

/**
 * Remove links que não existiam no material de origem (a IA nunca deve criar URLs).
 * `html` e `sourceHtml` precisam ter passado pelo sanitize (mesmo formato de <a href="...">);
 * `sourceText` libera endereços citados literalmente pela equipe (ex.: na instrução).
 */
function keepSourceLinks(html: string, sourceHtml = "", sourceText = ""): string {
  const allowed = new Set([...sourceHtml.matchAll(ANCHOR)].map((m) => m[1]));
  const ok = (href: string) => allowed.has(href) || (!!sourceText && sourceText.includes(href.replace(/&amp;/g, "&")));
  return html.replace(ANCHOR, (whole, href: string, text: string) => (ok(href) ? whole : text));
}

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)\S+/gi;

/** Texto puro sem URLs soltas (a IA não pode inventar endereços). */
function cleanPlain(value: string, max: number): string {
  return clampText(plainText(value).replace(URL_IN_TEXT, "").replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, ""), max);
}

/** Lista de frases curtas: tira marcadores, vazios e repetidos. */
function cleanList(items: string[], maxItems: number, maxChars: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = cleanPlain(item.replace(/^\s*(\d+[.)]|[-*•])\s+/, ""), maxChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.slice(0, maxItems);
}

function cleanFaq(items: FaqItem[], maxItems: number): FaqItem[] {
  const seen = new Set<string>();
  const out: FaqItem[] = [];
  for (const item of items) {
    let question = cleanPlain(item.question, 200).replace(/^\s*(\d+[.)]|[-*•]|P:)\s*/i, "");
    const answer = cleanPlain(item.answer.replace(/^\s*R:\s*/i, ""), 700);
    if (!question || !answer) continue;
    if (!/[?]$/.test(question)) question = `${question.replace(/[.!:;]+$/, "")}?`;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question, answer });
  }
  return out.slice(0, maxItems);
}

/** Primeiro parágrafo do HTML, como texto puro (reserva para a resposta direta). */
function firstParagraph(html: string): string {
  const match = /<p>([\s\S]*?)<\/p>/.exec(html);
  return match ? plainText(match[1]) : "";
}

function answerSummary(value: string, html: string): string {
  return cleanPlain(value, 600) || clampText(firstParagraph(html), 600);
}

const STOPWORDS = new Set(
  "a o as os e de da do das dos em no na nos nas um uma uns umas para pra por com sem que como qual quais seu sua seus suas ou ao aos à às é".split(
    " ",
  ),
);

function titleTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/** Títulos quase iguais (mesmas palavras relevantes). */
function similarTitles(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common) >= 0.7;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * O SDK converte `enum` do schema em dica de descrição (não é restrição dura), então o modelo
 * pode devolver "Passo a passo" ou "Informacional". Normaliza em vez de rejeitar a resposta.
 */
function toContentType(value: string, fallback: ContentType = "article"): ContentType {
  const v = fold(value);
  if ((CONTENT_TYPES as readonly string[]).includes(v)) return v as ContentType;
  if (/how|passo|tutorial|como fazer/.test(v)) return "howto";
  if (/guia|guide/.test(v)) return "guide";
  if (/list/.test(v)) return "list";
  if (/compar|versus|\bvs\b/.test(v)) return "comparison";
  if (/news|notici|novidade/.test(v)) return "news";
  if (/artig|article/.test(v)) return "article";
  return fallback;
}

function toIntent(value: string): IdeaIntent {
  const v = fold(value);
  if ((IDEA_INTENTS as readonly string[]).includes(v)) return v as IdeaIntent;
  if (/compar/.test(v)) return "comparativa";
  if (/local|geo/.test(v)) return "local";
  if (/comerc|transac|compra|contrat/.test(v)) return "comercial";
  return "informacional";
}

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/** Mês atual no Brasil, por extenso (ex.: "setembro de 2026"). */
function currentMonthBr(): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
}

// ---------------------------------------------------------------- dados do banco

const CLIENT_FIELDS =
  "name, segment, city, state, tone_of_voice, audience, keywords, about, services, service_area, expert_name, expert_credentials";

async function loadClient(clientId?: string): Promise<ClientContext | null> {
  if (!clientId) return null;
  const { data, error } = await db().from("clients").select(CLIENT_FIELDS).eq("id", clientId).maybeSingle();
  if (error) {
    console.error(`[ai] falha ao carregar cliente: ${error.code ?? ""} ${error.message}`);
    throw new AiError("Não foi possível carregar os dados do cliente. Tente de novo.", 500);
  }
  if (!data) throw new AiError("Cliente não encontrado. Ele pode ter sido removido; selecione outro.", 404);
  const client = data as ClientContext;
  return { ...client, keywords: client.keywords ?? [], services: client.services ?? [] };
}

function normalizeFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is FaqItem => !!f && typeof f.question === "string" && typeof f.answer === "string")
    .map((f) => ({ question: plainText(f.question), answer: plainText(f.answer) }))
    .filter((f) => f.question && f.answer);
}

async function loadVariationContext(postId: string, siteId: string) {
  const [postRes, siteRes] = await Promise.all([
    db()
      .from("posts")
      .select("title, excerpt, content_html, seo_title, seo_description, focus_keyword, answer_summary, faq")
      .eq("id", postId)
      .maybeSingle(),
    db().from("sites").select("name, url, client_id").eq("id", siteId).maybeSingle(),
  ]);
  for (const res of [postRes, siteRes]) {
    if (res.error) {
      console.error(`[ai] falha ao carregar artigo/site: ${res.error.code ?? ""} ${res.error.message}`);
      throw new AiError("Não foi possível carregar o artigo e o site. Tente de novo.", 500);
    }
  }
  const post = postRes.data as VariationSource | null;
  const site = siteRes.data as (VariationSite & { client_id: string }) | null;
  if (!post) throw new AiError("Artigo não encontrado. Salve o artigo antes de gerar a variação.", 404);
  if (!site) throw new AiError("Site não encontrado. Ele pode ter sido removido; selecione outro destino.", 404);

  const client = await loadClient(site.client_id);
  if (!client) throw new AiError("Este site não tem cliente vinculado. Vincule um cliente ao site e tente de novo.", 422);

  const content = htmlForPrompt(post.content_html ?? "");
  if (plainText(content).length < 200) {
    throw new AiError("O artigo ainda está curto demais para adaptar. Escreva o texto base e salve antes de gerar a variação.", 422);
  }
  if (content.length > MAX_HTML_CHARS) {
    throw new AiError("O artigo é longo demais para gerar a variação de uma vez. Divida o conteúdo ou encurte o texto.", 413);
  }
  return {
    post: {
      ...post,
      title: plainText(post.title || ""),
      content_html: content,
      answer_summary: post.answer_summary ? plainText(post.answer_summary) : null,
      faq: normalizeFaq(post.faq),
    },
    site,
    client,
  };
}

type PublishedRow = { override_title: string | null; post: { title: string | null } | { title: string | null }[] | null };

/**
 * Títulos dos artigos no ar nos sites do cliente, do mais recente ao mais antigo (sem repetição).
 * Falha aqui não impede as pautas: só perde o filtro de repetição.
 */
async function loadPublishedTitles(clientId: string, limit = 50): Promise<string[]> {
  const sitesRes = await db().from("sites").select("id").eq("client_id", clientId);
  if (sitesRes.error) {
    console.error(`[ai] falha ao carregar sites do cliente: ${sitesRes.error.code ?? ""} ${sitesRes.error.message}`);
    return [];
  }
  const siteIds = (sitesRes.data ?? []).map((s) => s.id as string);
  if (!siteIds.length) return [];

  const { data, error } = await db()
    .from("post_sites")
    .select("override_title, post:posts(title)")
    .in("site_id", siteIds)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit * 3);
  if (error) {
    console.error(`[ai] falha ao carregar títulos publicados: ${error.code ?? ""} ${error.message}`);
    return [];
  }

  const seen = new Set<string>();
  const titles: string[] = [];
  for (const row of (data ?? []) as unknown as PublishedRow[]) {
    const post = Array.isArray(row.post) ? row.post[0] : row.post;
    for (const raw of [row.override_title, post?.title]) {
      const title = raw ? plainText(raw) : "";
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
    }
    if (titles.length >= limit) break;
  }
  return titles.slice(0, limit);
}

// ---------------------------------------------------------------- ações

const htmlSchema = z.object({ html: z.string() });
const faqSchema = z.array(z.object({ question: z.string(), answer: z.string() }));
// Texto livre no schema (ver `toContentType`); a lista de valores vai no prompt e na descrição.
const contentTypeSchema = z.string().describe(`Um destes: ${CONTENT_TYPES.join(", ")}`);

/** Quem está usando o assistente (autor padrão dos artigos gerados). */
export type AiContext = { userName?: string | null };

type Handlers = { [A in AiAction]: (input: AiInput[A], signal?: AbortSignal, ctx?: AiContext) => Promise<AiOutput[A]> };

// ---------------------------------------------------------------- pesquisa de fontes (busca na web)

function normUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return "";
  }
}

/**
 * Busca fontes reais na web antes de escrever. Só aceita endereços que apareceram nos
 * resultados da busca (nada inventado). Falha em silêncio: o artigo sai sem pesquisa.
 */
async function researchSources(
  input: { topic: string; keyword?: string },
  client: ClientContext | null,
  signal?: AbortSignal,
  broad = false,
): Promise<ResearchNote[]> {
  const model = aiModel();
  if (!supportsAdaptive(model)) return [];
  const prompt = researchPrompt(input, client, broad);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.user }];
  const seen = new Map<string, string>();
  let text = "";
  try {
    for (let turn = 0; turn < 3; turn++) {
      const msg = await anthropic().messages.create(
        {
          model,
          max_tokens: 8_000,
          system: prompt.system,
          messages,
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: 5,
              user_location: { type: "approximate", country: "BR" },
            },
          ],
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
        },
        { timeout: 90_000, signal },
      );
      for (const block of msg.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") seen.set(normUrl(r.url), r.url);
        } else if (block.type === "text") {
          text += block.text;
        }
      }
      // busca longa: a API pausa o turno; reenviar a resposta retoma de onde parou
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    console.error("[ai] pesquisa de fontes falhou:", err instanceof Anthropic.APIError ? `${err.status} ${err.type ?? ""}` : (err as Error)?.name);
    return [];
  }

  const notes: ResearchNote[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/FONTE:\s*(.+)$/i);
    if (!m) continue;
    const [title, url, publisher, fact] = m[1].split("||").map((x) => x.trim());
    const original = url ? seen.get(normUrl(url)) : undefined;
    if (!title || !original || !fact) continue; // endereço que não veio da busca é descartado
    if (notes.some((n) => normUrl(n.url) === normUrl(original))) continue;
    notes.push({ title: clampText(title, 160), url: original, publisher: publisher ? clampText(publisher, 80) : null, fact: clampText(fact, 300) });
    if (notes.length >= 4) break;
  }
  return notes;
}

// ---------------------------------------------------------------- conferência pelo checklist

type FullArticleOut = AiOutput["full_article"];

/** Itens do checklist de SEO/GEO que o próprio texto consegue resolver (capa, fontes e autor ficam de fora). */
const FIXABLE = new Set([
  "keyword-title",
  "keyword-intro",
  "keyword-heading",
  "keyword-description",
  "keyword-slug",
  "length",
  "headings",
  "title-length",
  "description-length",
  "answer-length",
  "answer-entity",
  "question-headings",
  "short-sections",
  "takeaways",
  "faq",
  "concrete-data",
]);

type Checklist = { fixable: string[]; pending: string[] };

function checklist(a: FullArticleOut, entities: string[]): Checklist {
  const seo = seoReport({
    title: a.title,
    seoTitle: a.seo_title,
    seoDescription: a.seo_description,
    excerpt: a.excerpt,
    slug: a.slug,
    focusKeyword: a.focus_keyword,
    html: a.content_html,
    answerSummary: a.answer_summary,
  });
  const geo = geoReport({
    answerSummary: a.answer_summary,
    focusKeyword: a.focus_keyword,
    entities,
    html: a.content_html,
    keyTakeaways: a.key_takeaways,
    faq: a.faq,
    sources: a.sources ?? [],
    authorName: a.author_name ?? null,
    now: Date.now(),
  });
  const failed = [...seo.checks, ...geo.checks].filter((c) => !c.ok);
  return {
    fixable: failed.filter((c) => FIXABLE.has(c.id)).map((c) => `${c.label}: ${c.hint}`),
    pending: failed.map((c) => c.label),
  };
}

/** Correções que não precisam de IA: slug com a palavra-chave. */
function fixDeterministic(a: FullArticleOut): FullArticleOut {
  const kw = slugify(a.focus_keyword || "");
  if (kw && !a.slug.includes(kw)) {
    const rest = slugify(a.title)
      .split("-")
      .filter((w) => !kw.split("-").includes(w))
      .slice(0, 4)
      .join("-");
    return { ...a, slug: [kw, rest].filter(Boolean).join("-").slice(0, 80).replace(/-+$/, "") };
  }
  return a;
}

const handlers: Handlers = {
  async titles(input, signal) {
    const client = await loadClient(input.clientId);
    const out = await generate(
      z.object({ titles: z.array(z.string()) }),
      titlesPrompt(input, client),
      { maxTokens: 4000, timeoutMs: 60_000, effort: "low" },
      signal,
    );
    const seen = new Set<string>();
    const unique = out.titles.map(cleanTitle).filter((t) => {
      const key = t.toLowerCase();
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const fitting = unique.filter((t) => t.length <= 65);
    const titles = (fitting.length >= 3 ? fitting : unique.map((t) => clampText(t, 65))).slice(0, 8);
    if (!titles.length) throw new AiError("O assistente não sugeriu títulos. Detalhe mais o tema e tente de novo.", 502);
    return { titles };
  },

  async outline(input, signal) {
    const client = await loadClient(input.clientId);
    const out = await generate(
      htmlSchema,
      outlinePrompt(input, client),
      { maxTokens: 8000, timeoutMs: 90_000, effort: "medium" },
      signal,
    );
    return { html: safeHtml(out.html) };
  },

  async draft(input, signal) {
    const client = await loadClient(input.clientId);
    const words = input.words ?? DEFAULT_WORDS;
    const outlineHtml = input.outlineHtml ? htmlForPrompt(input.outlineHtml) : undefined;
    const out = await generate(
      htmlSchema,
      draftPrompt({ ...input, outlineHtml, words }, client),
      { maxTokens: clampInt(10_000 + words * 6, 12_000, 32_000), timeoutMs: 280_000, effort: "medium" },
      signal,
    );
    return { html: keepSourceLinks(safeHtml(out.html), outlineHtml) };
  },

  async improve(input, signal) {
    const html = htmlForPrompt(input.html);
    if (!plainText(html)) throw new AiError("Selecione um texto para melhorar.", 400);
    const out = await generate(
      htmlSchema,
      improvePrompt({ html, instruction: input.instruction }),
      { maxTokens: clampInt(6_000 + html.length / 2, 6_000, 32_000), timeoutMs: 180_000, effort: "medium" },
      signal,
    );
    // Links do trecho original continuam; um link novo só fica se o endereço veio na instrução.
    return { html: keepSourceLinks(safeHtml(out.html), html, input.instruction) };
  },

  async seo(input, signal) {
    const out = await generate(
      z.object({ seo_title: z.string(), seo_description: z.string(), excerpt: z.string(), slug: z.string() }),
      seoPrompt({ title: plainText(input.title), html: htmlForPrompt(input.html), keyword: input.keyword }),
      { maxTokens: 4000, timeoutMs: 60_000, effort: "low" },
      signal,
    );
    return {
      seo_title: clampText(out.seo_title, 60),
      seo_description: clampText(out.seo_description, 160),
      excerpt: clampText(out.excerpt, 220),
      slug: slugify(out.slug) || slugify(input.title),
    };
  },

  async variation(input, signal) {
    const { post, site, client } = await loadVariationContext(input.postId, input.siteId);
    const out = await generate(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        content_html: z.string(),
        seo_title: z.string(),
        seo_description: z.string(),
        answer_summary: z.string(),
        faq: faqSchema,
      }),
      variationPrompt(post, site, client),
      {
        maxTokens: clampInt(14_000 + post.content_html.length / 2, 14_000, 32_000),
        timeoutMs: 280_000,
        effort: "medium",
      },
      signal,
    );
    const content_html = keepSourceLinks(safeHtml(out.content_html), post.content_html);
    return {
      title: clampText(cleanTitle(out.title), 80),
      excerpt: clampText(out.excerpt, 220),
      content_html,
      seo_title: clampText(out.seo_title, 60),
      seo_description: clampText(out.seo_description, 160),
      answer_summary: answerSummary(out.answer_summary, content_html),
      faq: cleanFaq(out.faq, 5),
    };
  },

  async geo(input, signal) {
    const client = await loadClient(input.clientId);
    const html = htmlForPrompt(input.html);
    if (plainText(html).length < 200) {
      throw new AiError("O artigo ainda está curto demais para gerar os blocos de GEO. Escreva o texto antes.", 422);
    }
    const out = await generate(
      z.object({
        answer_summary: z.string(),
        key_takeaways: z.array(z.string()),
        faq: faqSchema,
        content_type: contentTypeSchema,
      }),
      geoPrompt({ title: plainText(input.title), html, keyword: input.keyword }, client),
      { maxTokens: clampInt(8_000 + html.length / 8, 8_000, 16_000), timeoutMs: 120_000, effort: "medium" },
      signal,
    );
    const faq = cleanFaq(out.faq, 5);
    const answer = answerSummary(out.answer_summary, html);
    if (!answer || !faq.length) {
      throw new AiError("O assistente devolveu os blocos de GEO incompletos. Tente de novo.", 502);
    }
    return {
      answer_summary: answer,
      key_takeaways: cleanList(out.key_takeaways, 6, 240),
      faq,
      content_type: toContentType(out.content_type),
    };
  },

  async full_article(input, signal, ctx) {
    const startedAt = Date.now();
    const client = await loadClient(input.clientId);
    const words = input.words ?? DEFAULT_FULL_ARTICLE_WORDS;
    // 1) pesquisa fontes reais na web (fatos concretos + links conferidos)
    let research = await researchSources({ topic: input.topic, keyword: input.keyword }, client, signal);
    // sem fonte na primeira busca: tenta de novo, mais ampla (fontes oficiais de qualquer país)
    if (!research.length) research = await researchSources({ topic: input.topic, keyword: input.keyword }, client, signal, true);

    const schema = z.object({
      title: z.string(),
      slug: z.string(),
      focus_keyword: z.string(),
      content_type: contentTypeSchema,
      content_html: z.string(),
      answer_summary: z.string(),
      key_takeaways: z.array(z.string()),
      faq: faqSchema,
      excerpt: z.string(),
      seo_title: z.string(),
      seo_description: z.string(),
      source_suggestions: z.array(z.string()),
    });
    const callCfg = { maxTokens: clampInt(14_000 + words * 7, 18_000, 32_000), timeoutMs: 280_000, effort: "medium" as const };

    const sources: SourceItem[] = research.map((r) => ({ title: r.title, url: r.url, publisher: r.publisher }));
    const author_name = client?.expert_name?.trim() || ctx?.userName?.trim() || null;
    const finish = (out: z.infer<typeof schema>): FullArticleOut => {
      // Os links do texto vêm só da pesquisa; qualquer outro seria inventado.
      const content_html = keepSourceLinks(safeHtml(out.content_html), "", research.map((r) => r.url).join(" "));
      const title = clampText(cleanTitle(out.title), 80) || clampText(cleanTitle(input.topic), 80);
      return {
        title,
        slug: slugify(out.slug) || slugify(title),
        excerpt: clampText(out.excerpt, 220),
        content_html,
        answer_summary: answerSummary(out.answer_summary, content_html),
        key_takeaways: cleanList(out.key_takeaways, 6, 240),
        faq: cleanFaq(out.faq, 5),
        seo_title: clampText(out.seo_title, 60),
        seo_description: clampText(out.seo_description, 160),
        focus_keyword: input.keyword ?? clampText(out.focus_keyword, 80),
        content_type: input.contentType ?? toContentType(out.content_type),
        source_suggestions: sources.length ? [] : cleanList(out.source_suggestions, 5, 240),
        sources,
        author_name,
      };
    };

    // 2) escreve o artigo com a pesquisa
    const raw = await generate(
      schema,
      fullArticlePrompt({ topic: input.topic, keyword: input.keyword, contentType: input.contentType, words, research }, client),
      callCfg,
      signal,
    );
    let article = fixDeterministic(finish(raw));

    // 3) regra da OutBox: todo artigo gerado sai com 10 de 10 em SEO e GEO.
    //    Confere pelo checklist do CMS e corrige até 3 vezes o que faltar.
    const entities = [client?.name, client?.city].filter((x): x is string => Boolean(x));
    let current = raw;
    let report = checklist(article, entities);
    for (let round = 0; round < 3 && report.fixable.length; round++) {
      if (Date.now() - startedAt > 330_000) break; // a pessoa está esperando na tela
      try {
        const fixed = await generate(schema, fixArticlePrompt(current, report.fixable, client), callCfg, signal);
        const candidate = fixDeterministic(finish(fixed));
        const next = checklist(candidate, entities);
        if (next.pending.length <= report.pending.length) {
          article = candidate;
          current = fixed;
          report = next;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        break; // mantém a melhor versão até aqui
      }
    }
    article = { ...article, pending_checks: report.pending };
    return article;
  },

  async ideas(input, signal) {
    const count = input.count ?? DEFAULT_IDEAS;
    const [client, publishedTitles] = await Promise.all([loadClient(input.clientId), loadPublishedTitles(input.clientId)]);
    if (!client) throw new AiError("Escolha um cliente para gerar pautas.", 400);
    const out = await generate(
      z.object({
        ideas: z.array(
          z.object({
            title: z.string(),
            keyword: z.string(),
            intent: z.string().describe(`Um destes: ${IDEA_INTENTS.join(", ")}`),
            content_type: contentTypeSchema,
            angle: z.string(),
          }),
        ),
      }),
      ideasPrompt({ count, focus: input.focus, monthLabel: currentMonthBr(), publishedTitles }, client),
      { maxTokens: clampInt(6_000 + count * 400, 8_000, 16_000), timeoutMs: 120_000, effort: "medium" },
      signal,
    );

    // Filtro de segurança: nada repetido entre as sugestões nem parecido com o que já está no ar.
    const taken = publishedTitles.map(titleTokens);
    const ideas: AiOutput["ideas"]["ideas"] = [];
    for (const idea of out.ideas) {
      const title = clampText(cleanTitle(idea.title), 80);
      if (!title) continue;
      const tokens = titleTokens(title);
      if (taken.some((t) => similarTitles(t, tokens))) continue;
      taken.push(tokens);
      ideas.push({
        title,
        keyword: clampText(idea.keyword, 80).toLowerCase() || title.toLowerCase(),
        intent: toIntent(idea.intent),
        content_type: toContentType(idea.content_type),
        angle: cleanPlain(idea.angle, 200),
      });
      if (ideas.length >= count) break;
    }
    if (!ideas.length) {
      throw new AiError("O assistente não sugeriu pautas novas. Mude o foco ou tente de novo.", 502);
    }
    return { ideas };
  },
};

/** Executa uma ação do assistente. Lança `AiError` (mensagem pt-BR) ou erros do SDK — passe por `toAiError`. */
export function runAi<A extends AiAction>(action: A, input: AiInput[A], signal?: AbortSignal, ctx?: AiContext): Promise<AiOutput[A]> {
  const handler = handlers[action] as (input: AiInput[A], signal?: AbortSignal, ctx?: AiContext) => Promise<AiOutput[A]>;
  return handler(input, signal, ctx);
}

// ---------------------------------------------------------------- erros

/** Converte qualquer erro em `AiError` com mensagem acionável. Não registra chaves nem conteúdo. */
export function toAiError(err: unknown, action: string): AiError {
  if (err instanceof AiError) return err;
  const model = aiModel();

  if (err instanceof Anthropic.APIError) {
    console.error(
      `[ai] ${action}: ${err.constructor.name} status=${err.status ?? "-"} type=${err.type ?? "-"} request_id=${err.requestID ?? "-"}`,
    );
  } else {
    const e = err as { name?: string; message?: string };
    console.error(`[ai] ${action}: ${e?.name ?? "Error"} ${String(e?.message ?? "").slice(0, 200)}`);
  }

  // Ordem: do mais específico ao mais genérico (timeout e conexão são subclasses de APIError).
  if (err instanceof Anthropic.APIUserAbortError) return new AiError("Pedido cancelado.", 499);
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError(
      "O assistente demorou demais para responder. Tente de novo; em textos longos, peça menos palavras.",
      504,
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("Não foi possível conectar ao serviço da Anthropic. Tente de novo em instantes.", 502);
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError(
      "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY nas variáveis do Easypanel.",
      503,
    );
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(
      `A chave da Anthropic não tem acesso ao modelo ${model}. Verifique a conta ou ajuste AI_MODEL no Easypanel.`,
      503,
    );
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError(
      `Modelo ${model} não encontrado. Ajuste AI_MODEL no Easypanel ou remova a variável para usar o padrão.`,
      503,
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("Limite de uso do assistente atingido. Aguarde um minuto e tente de novo.", 429);
  }
  if (err instanceof Anthropic.APIError) {
    if (isOverloaded(err)) {
      return new AiError("O serviço da Anthropic está sobrecarregado agora. Tente de novo em alguns minutos.", 503);
    }
    if (err.status === 402 || err.type === "billing_error") {
      return new AiError("A conta da Anthropic está sem créditos. Adicione créditos no console da Anthropic.", 503);
    }
    if (err.status === 413) {
      return new AiError("O texto é grande demais para o assistente. Envie um trecho menor.", 413);
    }
    if (err.status === 504 || err.type === "timeout_error") {
      return new AiError(
        "O assistente demorou demais para responder. Tente de novo; em textos longos, peça menos palavras.",
        504,
      );
    }
    if (err instanceof Anthropic.BadRequestError) {
      return new AiError(
        "O assistente não conseguiu processar este pedido. Se o texto for muito longo, envie um trecho menor; se continuar, avise o suporte.",
        502,
      );
    }
    if ((err.status ?? 0) >= 500) {
      return new AiError("O serviço da Anthropic teve uma falha temporária. Tente de novo em instantes.", 502);
    }
  }
  if (err instanceof Anthropic.AnthropicError) {
    return new AiError("O assistente devolveu uma resposta inesperada. Tente de novo.", 502);
  }
  return new AiError("Algo deu errado no assistente. Tente de novo em instantes.", 500);
}
