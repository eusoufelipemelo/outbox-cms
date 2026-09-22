import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { processAutomations } from "@/lib/automation/run";

// Cron externo (opcional; o servidor já roda um agendador interno a cada 60 s).
// Autenticação: `Authorization: Bearer ${CRON_SECRET}`.
// Sem CRON_SECRET definido: liberado só fora de produção; em produção responde 401
// (o endpoint dispara publicações, então não fica aberto por padrão).

export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

function authorized(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    const message = env.cronSecret
      ? "Não autorizado. Envie o cabeçalho Authorization: Bearer <CRON_SECRET>."
      : "Defina a variável CRON_SECRET no servidor para usar o cron externo.";
    return Response.json({ error: message }, { status: 401, headers: NO_STORE });
  }
  try {
    const results = await processAutomations();
    return Response.json({ ok: true, processed: results.length, results }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cron] automacoes:", err);
    return Response.json({ error: "Falha ao rodar as automações. Veja os logs do servidor." }, { status: 500, headers: NO_STORE });
  }
}

export const GET = handle;
export const POST = handle;
