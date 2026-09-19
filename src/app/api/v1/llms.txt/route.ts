import type { NextRequest } from "next/server";
import { listAllSummaries } from "@/lib/content";
import { authSite, preflight, safely, text } from "../_lib/http";
import { buildLlmsTxt } from "../_lib/llms";

// GET /api/v1/llms.txt?key=pk_… → llms.txt (llmstxt.org): empresa, serviços, 50 artigos mais recentes e contato.
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const posts = await listAllSummaries(auth.site, 50);
    return text(buildLlmsTxt(auth.site, posts));
  });
}

export function OPTIONS() {
  return preflight();
}
