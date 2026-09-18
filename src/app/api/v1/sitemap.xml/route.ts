import type { NextRequest } from "next/server";
import { listAllSummaries, xmlEscape } from "@/lib/content";
import { joinUrl } from "@/lib/utils";
import { authSite, preflight, safely, xml } from "../_lib/http";

// GET /api/v1/sitemap.xml?key=pk_… → sitemap dos artigos do site (para incluir no sitemap index do cliente).
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const posts = await listAllSummaries(auth.site);
    const blogUrl = joinUrl(auth.site.url, auth.site.blog_path);
    const lastmod = posts[0]?.updated_at;
    const urls = [
      `  <url><loc>${xmlEscape(blogUrl)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>daily</changefreq></url>`,
      ...posts.map((p) => `  <url><loc>${xmlEscape(p.url)}</loc><lastmod>${p.updated_at}</lastmod></url>`),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    return xml(body);
  });
}

export function OPTIONS() {
  return preflight();
}
