import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { pick } from "@/lib/settings-store";

/**
 * OpenRouter: uma só chave e um só saldo para vários modelos (Claude, GPT, Gemini, Llama…).
 * Usa o formato de chat da OpenAI, com JSON Schema para respostas estruturadas e o
 * plugin de busca na web para a pesquisa de fontes dos artigos.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Funções do CMS que podem usar modelos diferentes. */
export const TASKS = ["artigo", "pautas", "diagnostico", "apoio", "pesquisa"] as const;
export type Task = (typeof TASKS)[number];

/** Modelo da função, com o modelo padrão do OpenRouter como reserva. */
export function modelFor(task?: Task): string {
  return (task ? pick(`model_${task}`) : null) || env.openrouterModel;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export type Annotation = { url: string; title?: string; content?: string };

type Choice = {
  message?: {
    content?: string | null;
    annotations?: { type?: string; url_citation?: { url?: string; title?: string; content?: string } }[];
  };
  finish_reason?: string;
  error?: { message?: string };
};

type ChatResponse = { choices?: Choice[]; error?: { message?: string; code?: number } };

/** Campos de validação que o modo estrito de JSON Schema não aceita. */
const DROP = new Set(["minLength", "maxLength", "pattern", "format", "minimum", "maximum", "minItems", "maxItems", "default", "examples"]);

/** Ajusta o schema do zod ao que os modelos aceitam: sem validações extras e com tudo obrigatório. */
function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (DROP.has(key)) continue;
    out[key] = strictSchema(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Record<string, unknown>);
  }
  return out;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  delete raw.$schema;
  return strictSchema(raw) as Record<string, unknown>;
}

function headers(): HeadersInit {
  const key = env.openrouterApiKey;
  if (!key) throw new OpenRouterError("OpenRouter desligado: configure OPENROUTER_API_KEY nas variáveis do Easypanel.", 503);
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    // identificam o app nos rankings do OpenRouter
    "HTTP-Referer": env.appUrl,
    "X-Title": "OutBox CMS",
  };
}

async function post(body: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new OpenRouterError("O OpenRouter não respondeu a tempo. Tente de novo em instantes.", 504);
  }
  const json = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok || json.error) {
    const message = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) throw new OpenRouterError("A chave do OpenRouter foi recusada. Confira OPENROUTER_API_KEY no Easypanel.", 503);
    if (res.status === 402) throw new OpenRouterError("Sem créditos no OpenRouter. Adicione saldo na conta e tente de novo.", 402);
    if (res.status === 429) throw new OpenRouterError("Muitos pedidos ao OpenRouter agora. Espere alguns segundos e tente de novo.", 429);
    if (res.status === 404) throw new OpenRouterError(`Modelo não encontrado no OpenRouter. Confira OPENROUTER_MODEL no Easypanel. (${message})`, 404);
    throw new OpenRouterError(`OpenRouter: ${message}`.slice(0, 300), res.status || 502);
  }
  return json;
}

/**
 * Acha o JSON na resposta: inteiro, dentro de ```json … ``` ou o primeiro objeto equilibrado
 * do texto (alguns modelos escrevem uma frase antes ou deixam blocos de raciocínio).
 */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "").trim();
  const tries = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) tries.push(fenced[1]);
  const start = text.search(/[{[]/);
  if (start >= 0) {
    const open = text[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) {
        tries.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  for (const candidate of tries) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // tenta o próximo formato
    }
  }
  return undefined;
}

/** Resposta em JSON, validada pelo schema do zod. */
export async function openrouterJson<S extends z.ZodType>(
  schema: S,
  prompt: { system: string; user: string },
  cfg: { maxTokens: number; timeoutMs: number; effort: "low" | "medium" | "high"; task?: Task },
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const model = modelFor(cfg.task);
  const body = {
    model,
    max_tokens: cfg.maxTokens,
    messages: [
      { role: "system", content: `${prompt.system}\n\nResponda somente com o JSON pedido, sem texto antes ou depois e sem blocos de código.` },
      { role: "user", content: prompt.user },
    ],
    reasoning: { effort: cfg.effort },
    // só roteia para provedores que aceitam resposta estruturada
    provider: { require_parameters: true },
    response_format: { type: "json_schema", json_schema: { name: "resposta", strict: true, schema: jsonSchemaOf(schema) } },
  };

  let json: ChatResponse;
  try {
    json = await post(body, cfg.timeoutMs, signal);
  } catch (err) {
    // modelo sem suporte a JSON Schema: tenta o modo JSON simples antes de desistir
    if (err instanceof OpenRouterError && (err.status === 400 || err.status === 404 || err.status === 422)) {
      json = await post({ ...body, provider: undefined, response_format: { type: "json_object" } }, cfg.timeoutMs, signal);
    } else throw err;
  }

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") {
    throw new OpenRouterError("A resposta ficou longa demais e veio cortada. Peça menos palavras ou envie um trecho menor.", 422);
  }
  if (!text.trim()) throw new OpenRouterError("O modelo devolveu uma resposta vazia. Tente de novo.", 502);

  const data = extractJson(text);
  if (data === undefined) {
    throw new OpenRouterError(
      `O modelo ${model} respondeu fora do formato JSON que o CMS pede. Escolha outro modelo no Painel administrativo (os da OpenAI, Anthropic e Google costumam aceitar).`,
      502,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new OpenRouterError(`O modelo ${model} devolveu uma resposta incompleta. Tente de novo ou escolha outro modelo.`, 502);
  }
  return parsed.data;
}

/** Texto com busca na web (plugin do OpenRouter). Devolve o texto e os endereços que a busca trouxe. */
export async function openrouterSearch(
  prompt: { system: string; user: string },
  cfg: { maxTokens: number; timeoutMs: number; maxResults?: number },
  signal?: AbortSignal,
): Promise<{ text: string; sources: Annotation[] }> {
  const json = await post(
    {
      model: modelFor("pesquisa"),
      max_tokens: cfg.maxTokens,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      plugins: [{ id: "web", max_results: cfg.maxResults ?? 5 }],
    },
    cfg.timeoutMs,
    signal,
  );
  const choice = json.choices?.[0];
  const sources: Annotation[] = (choice?.message?.annotations ?? [])
    .filter((a) => a.type === "url_citation" && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation!.url!, title: a.url_citation?.title, content: a.url_citation?.content }));
  return { text: choice?.message?.content ?? "", sources };
}
