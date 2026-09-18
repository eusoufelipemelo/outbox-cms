import type { NextRequest } from "next/server";
import { getPublishedPost } from "@/lib/content";
import { apiError, authSite, json, preflight, safely } from "../../_lib/http";

// GET /api/v1/posts/{slug}?key=pk_…
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const { slug } = await ctx.params;
    const post = await getPublishedPost(auth.site, decodeURIComponent(slug));
    if (!post) return apiError(404, "Artigo não encontrado neste site. Confira o slug ou se o artigo está publicado aqui.");
    return json(post);
  });
}

export function OPTIONS() {
  return preflight();
}
