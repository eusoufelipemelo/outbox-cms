import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * OpenRouter: uma só chave e um só saldo para vários modelos (Claude, GPT, Gemini, Llama…).
 * Usa o formato de chat da OpenAI, com JSON Schema para respostas estruturadas e o
 * plugin de busca na web para a pesquisa de fontes dos artigos.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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

/** Resposta em JSON, validada pelo schema do zod. */
export async function openrouterJson<S extends z.ZodType>(
  schema: S,
  prompt: { system: string; user: string },
  cfg: { maxTokens: number; timeoutMs: number; effort: "low" | "medium" | "high" },
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const json = await post(
    {
      model: env.openrouterModel,
      max_tokens: cfg.maxTokens,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      reasoning: { effort: cfg.effort },
      response_format: { type: "json_schema", json_schema: { name: "resposta", strict: true, schema: jsonSchemaOf(schema) } },
    },
    cfg.timeoutMs,
    signal,
  );

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") {
    throw new OpenRouterError("A resposta ficou longa demais e veio cortada. Peça menos palavras ou envie um trecho menor.", 422);
  }
  if (!text.trim()) throw new OpenRouterError("O modelo devolveu uma resposta vazia. Tente de novo.", 502);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // alguns modelos embrulham o JSON em ```json … ```
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    try {
      data = JSON.parse(fenced?.[1] ?? "");
    } catch {
      throw new OpenRouterError("O modelo devolveu uma resposta em formato inesperado. Tente de novo.", 502);
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new OpenRouterError("O modelo devolveu uma resposta incompleta. Tente de novo.", 502);
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
      model: env.openrouterModel,
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
