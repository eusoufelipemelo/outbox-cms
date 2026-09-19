import type { NextRequest } from "next/server";
import { listAllSummaries, xmlEscape } from "@/lib/content";
import { joinUrl } from "@/lib/utils";
import { authSite, preflight, safely, xml } from "../_lib/http";

/** Data W3C (ISO 8601) válida para <lastmod>, ou null. */
function lastmod(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function urlEntry(loc: string, mod: string | null, extra = ""): string {
  return `  <url><loc>${xmlEscape(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}${extra}</url>`;
}

// GET /api/v1/sitemap.xml?key=pk_… → sitemap dos artigos do site (para incluir no sitemap index do cliente).
// <lastmod> = updated_at da versão no ar (muda a cada Atualizar).
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const posts = await listAllSummaries(auth.site);
    const blogUrl = joinUrl(auth.site.url, auth.site.blog_path);

    const seen = new Set<string>([blogUrl]);
    let newest: number | null = null;
    const entries: string[] = [];
    for (const p of posts) {
      if (!/^https?:\/\//i.test(p.url) || seen.has(p.url)) continue;
      seen.add(p.url);
      const mod = lastmod(p.updated_at);
      if (mod) newest = Math.max(newest ?? 0, Date.parse(mod));
      entries.push(urlEntry(p.url, mod));
    }
    const urls = [urlEntry(blogUrl, newest ? new Date(newest).toISOString() : null, "<changefreq>daily</changefreq>"), ...entries];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    return xml(body);
  });
}

export function OPTIONS() {
  return preflight();
}
