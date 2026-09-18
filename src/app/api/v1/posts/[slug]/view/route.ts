import type { NextRequest } from "next/server";
import { db } from "@/lib/supabase/admin";
import { findVisiblePostId } from "@/lib/content";
import { apiError, authSite, json, preflight, safely } from "../../../_lib/http";

// POST /api/v1/posts/{slug}/view?key=pk_… — conta uma leitura (1 por visitante/artigo a cada 30 min).

const WINDOW_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 20_000;
const g = globalThis as typeof globalThis & { __outboxViews?: Map<string, number> };
const seen = (g.__outboxViews ??= new Map<string, number>());

function firstView(key: string): boolean {
  const now = Date.now();
  const until = seen.get(key);
  if (until && until > now) return false;
  if (seen.size >= MAX_ENTRIES) {
    for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
    if (seen.size >= MAX_ENTRIES) seen.clear();
  }
  seen.set(key, now + WINDOW_MS);
  return true;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anon";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const { slug } = await ctx.params;
    const postId = await findVisiblePostId(auth.site, decodeURIComponent(slug));
    if (!postId) return apiError(404, "Artigo não encontrado neste site.");

    const counted = firstView(`${clientIp(req)}|${auth.site.id}|${postId}`);
    if (counted) {
      const { error } = await db().rpc("increment_post_view", { p_post: postId, p_site: auth.site.id });
      if (error) console.error("[api/v1] increment_post_view:", error.message);
    }
    return json({ ok: true, counted }, { cache: "no-store" });
  });
}

export function OPTIONS() {
  return preflight();
}
