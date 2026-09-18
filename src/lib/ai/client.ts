import type { AiAction, AiInput, AiOutput, AiStatus } from "./types";

// Lado do navegador do assistente: chama /api/ai. Erros sempre viram `Error` com mensagem pt-BR pronta para toast.

const GENERIC = "O assistente não respondeu. Tente de novo.";

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (body && typeof body.error === "string" && body.error) return body.error;
  if (res.status === 401) return "Sessão expirada. Entre novamente para usar o assistente.";
  if (res.status === 504 || res.status === 524) {
    return "O assistente demorou demais para responder. Tente de novo; em textos longos, peça menos palavras.";
  }
  return GENERIC;
}

export async function callAi<A extends AiAction>(
  action: A,
  input: AiInput[A],
  opts?: { signal?: AbortSignal },
): Promise<AiOutput[A]> {
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, input }),
      signal: opts?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Pedido cancelado.");
    throw new Error("Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; error?: string } | null;
  if (!body?.ok) throw new Error(body?.error || GENERIC);
  return body.result as AiOutput[A];
}

/** GET /api/ai — se o assistente está ligado (e com qual modelo). Nunca lança: em erro, `enabled: false`. */
export async function getAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch("/api/ai", { cache: "no-store" });
    if (!res.ok) return { enabled: false };
    const body = (await res.json()) as Partial<AiStatus>;
    return { enabled: body.enabled === true, model: typeof body.model === "string" ? body.model : undefined };
  } catch {
    return { enabled: false };
  }
}
