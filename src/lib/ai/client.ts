import type { AiAction, AiInput, AiOutput } from "./types";

// STUB mínimo funcional — o módulo de IA pode refinar, sem mudar a assinatura.
export async function callAi<A extends AiAction>(action: A, input: AiInput[A]): Promise<AiOutput[A]> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || "O assistente não respondeu. Tente de novo.");
  return body.result as AiOutput[A];
}
