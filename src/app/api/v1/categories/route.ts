import type { NextRequest } from "next/server";
import { listTaxonomies } from "@/lib/content";
import { authSite, json, preflight, safely, siteInfo } from "../_lib/http";

// GET /api/v1/categories?key=pk_… → categorias e tags dos artigos no ar, com contagem.
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const { categories, tags } = await listTaxonomies(auth.site);
    return json({ data: categories, tags, site: siteInfo(auth.site) });
  });
}

export function OPTIONS() {
  return preflight();
}
