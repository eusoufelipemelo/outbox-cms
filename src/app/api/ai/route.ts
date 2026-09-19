import { getUser, type CurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { AI_DISABLED_MESSAGE, aiStatus, runAi, toAiError } from "@/lib/ai/server";
import type { AiAction, AiInput, AiResponse, AiStatus } from "@/lib/ai/types";
import { firstIssue, inputSchemas, requestSchema } from "@/lib/ai/validation";

// Assistente de escrita. Só para usuários logados; responde JSON (nunca redireciona).
export const dynamic = "force-dynamic";
// Rascunhos e variações completas podem levar alguns minutos.
export const maxDuration = 300;

const fail = (error: string, status: number) => Response.json({ ok: false, error } satisfies AiResponse, { status });

/** Só contas aprovadas (status "active") usam o assistente. */
async function currentUser(): Promise<CurrentUser | null> {
  try {
    const user = await getUser();
    return user?.status === "active" ? user : null;
  } catch {
    return null;
  }
}

const UNAUTHORIZED = "Sessão expirada. Entre novamente para usar o assistente.";

export async function GET() {
  if (!(await currentUser())) return Response.json({ error: UNAUTHORIZED }, { status: 401 });
  return Response.json(aiStatus() satisfies AiStatus);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail(UNAUTHORIZED, 401);
  if (!env.anthropicApiKey) return fail(AI_DISABLED_MESSAGE, 503);

  const body: unknown = await request.json().catch(() => null);
  const req = requestSchema.safeParse(body);
  if (!req.success) return fail(firstIssue(req.error), 400);

  const action: AiAction = req.data.action;
  const input = inputSchemas[action].safeParse(req.data.input);
  if (!input.success) return fail(firstIssue(input.error), 400);

  try {
    const result = await runAi(action, input.data as AiInput[typeof action], request.signal, { userName: user.name });
    return Response.json({ ok: true, result } satisfies AiResponse);
  } catch (err) {
    const aiErr = toAiError(err, action);
    return fail(aiErr.message, aiErr.status);
  }
}
