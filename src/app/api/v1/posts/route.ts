import type { NextRequest } from "next/server";
import { listPublishedPosts } from "@/lib/content";
import { apiError, authSite, intParam, json, preflight, safely, siteInfo } from "../_lib/http";

// GET /api/v1/posts?key=pk_…&page=1&per_page=12&category=&tag=&q=
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    const page = intParam(sp.get("page"), 1, 1, 10_000);
    const perPage = intParam(sp.get("per_page"), 12, 1, 50);
    const q = sp.get("q");
    if (q && q.length > 200) return apiError(400, "A busca (q) deve ter no máximo 200 caracteres.");

    const { data, total } = await listPublishedPosts(auth.site, {
      page,
      perPage,
      category: sp.get("category"),
      tag: sp.get("tag"),
      q,
    });
    return json({
      data,
      meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) },
      site: siteInfo(auth.site),
    });
  });
}

export function OPTIONS() {
  return preflight();
}
