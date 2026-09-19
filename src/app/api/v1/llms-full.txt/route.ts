import type { NextRequest } from "next/server";
import { listRecentFull } from "@/lib/content";
import { authSite, preflight, safely, text } from "../_lib/http";
import { buildLlmsFullTxt } from "../_lib/llms";

// GET /api/v1/llms-full.txt?key=pk_… → texto completo (markdown) dos 30 artigos mais recentes.
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const posts = await listRecentFull(auth.site, 30);
    return text(buildLlmsFullTxt(auth.site, posts));
  });
}

export function OPTIONS() {
  return preflight();
}
