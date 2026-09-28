import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { finishIgLogin } from "@/lib/instagram/oauth";
import { readState } from "@/lib/instagram/link";

function page(title: string, text: string, ok: boolean) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e10;color:#fff;font-family:system-ui,sans-serif;padding:24px}
main{max-width:440px}b{display:block;width:56px;height:8px;background:${ok ? "#52c98f" : "#ff7b6e"};margin-bottom:24px}h1{font-size:28px;margin:0 0 12px}p{color:#a4a7ae;line-height:1.5;margin:0}</style></head>
<body><main><b></b><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Retorno do Instagram: confere o state assinado e guarda o token da conta do cliente. */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const nonce = jar.get("ig_nonce")?.value;
  jar.delete({ name: "ig_nonce", path: "/api/instagram" });
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return page("Conexão cancelada", "Você não autorizou a OutBox a publicar no seu Instagram. Se foi sem querer, abra o link de novo.", false);
  const state = readState(params.get("state") ?? "");
  const code = params.get("code");
  if (!state || !code || state.nonce !== nonce) return page("Link expirado", "Abra de novo o link de conexão que a OutBox enviou e conclua em até 15 minutos.", false);
  try {
    const { username } = await finishIgLogin(state.clientId, code);
    return page("Instagram conectado", `Pronto${username ? `, @${username}` : ""}! A OutBox já pode publicar os posts aprovados na sua conta. Pode fechar esta página.`, true);
  } catch (err) {
    console.error("[instagram] login:", err instanceof Error ? err.message : err);
    return page("Não foi possível conectar", "Confira se a conta é profissional (Empresa ou Criador de conteúdo) e tente de novo. Se continuar, avise a OutBox.", false);
  }
}
