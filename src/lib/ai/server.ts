import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import type { AiAction, AiInput, AiOutput, AiStatus } from "./types";
import {
  draftPrompt,
  improvePrompt,
  outlinePrompt,
  seoPrompt,
  titlesPrompt,
  variationPrompt,
  type ClientContext,
  type Prompt,
  type VariationSite,
  type VariationSource,
} from "./prompts";
import { htmlForPrompt, plainText, sanitizeAiHtml } from "./sanitize";
import { DEFAULT_WORDS, MAX_HTML_CHARS } from "./validation";

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
    .replace(/[̀-ͯ]/g, "")
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

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

// ---------------------------------------------------------------- dados do banco

const CLIENT_FIELDS = "name, segment, city, state, tone_of_voice, audience, keywords";

async function loadClient(clientId?: string): Promise<ClientContext | null> {
  if (!clientId) return null;
  const { data, error } = await db().from("clients").select(CLIENT_FIELDS).eq("id", clientId).maybeSingle();
  if (error) {
    console.error(`[ai] falha ao carregar cliente: ${error.code ?? ""} ${error.message}`);
    throw new AiError("Não foi possível carregar os dados do cliente. Tente de novo.", 500);
  }
  if (!data) throw new AiError("Cliente não encontrado. Ele pode ter sido removido; selecione outro.", 404);
  return data as ClientContext;
}

async function loadVariationContext(postId: string, siteId: string) {
  const [postRes, siteRes] = await Promise.all([
    db()
      .from("posts")
      .select("title, excerpt, content_html, seo_title, seo_description, focus_keyword")
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
  return { post: { ...post, title: plainText(post.title || ""), content_html: content }, site, client };
}

// ---------------------------------------------------------------- ações

const htmlSchema = z.object({ html: z.string() });

type Handlers = { [A in AiAction]: (input: AiInput[A], signal?: AbortSignal) => Promise<AiOutput[A]> };

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
    return { html: safeHtml(out.html) };
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
    return { html: safeHtml(out.html) };
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
      }),
      variationPrompt(post, site, client),
      {
        maxTokens: clampInt(12_000 + post.content_html.length / 2, 12_000, 32_000),
        timeoutMs: 280_000,
        effort: "medium",
      },
      signal,
    );
    return {
      title: clampText(cleanTitle(out.title), 80),
      excerpt: clampText(out.excerpt, 220),
      content_html: safeHtml(out.content_html),
      seo_title: clampText(out.seo_title, 60),
      seo_description: clampText(out.seo_description, 160),
    };
  },
};

/** Executa uma ação do assistente. Lança `AiError` (mensagem pt-BR) ou erros do SDK — passe por `toAiError`. */
export function runAi<A extends AiAction>(action: A, input: AiInput[A], signal?: AbortSignal): Promise<AiOutput[A]> {
  const handler = handlers[action] as (input: AiInput[A], signal?: AbortSignal) => Promise<AiOutput[A]>;
  return handler(input, signal);
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
