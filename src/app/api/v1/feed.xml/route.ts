import type { NextRequest } from "next/server";
import { listRecentFull, xmlEscape } from "@/lib/content";
import { joinUrl } from "@/lib/utils";
import { authSite, preflight, safely, xml } from "../_lib/http";

function imageType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// GET /api/v1/feed.xml?key=pk_… → RSS 2.0 com os 30 artigos mais recentes.
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const site = auth.site;
    const posts = await listRecentFull(site, 30);
    const blogUrl = joinUrl(site.url, site.blog_path);
    const self = req.nextUrl.toString();

    const items = posts.map((p) =>
      [
        "    <item>",
        `      <title>${xmlEscape(p.title)}</title>`,
        `      <link>${xmlEscape(p.url)}</link>`,
        `      <guid isPermaLink="false">${xmlEscape(`outbox-${p.id}`)}</guid>`,
        p.published_at ? `      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : "",
        p.author ? `      <dc:creator>${xmlEscape(p.author)}</dc:creator>` : "",
        p.category ? `      <category>${xmlEscape(p.category)}</category>` : "",
        `      <description>${xmlEscape(p.excerpt)}</description>`,
        p.cover_image ? `      <enclosure url="${xmlEscape(p.cover_image.url)}" length="0" type="${imageType(p.cover_image.url)}" />` : "",
        `      <content:encoded>${cdata(p.content_html)}</content:encoded>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(site.name)}</title>
    <link>${xmlEscape(blogUrl)}</link>
    <description>${xmlEscape(`Artigos de ${site.client_name ?? site.name}`)}</description>
    <language>pt-BR</language>
    <atom:link href="${xmlEscape(self)}" rel="self" type="application/rss+xml" />
    ${posts[0]?.updated_at ? `<lastBuildDate>${new Date(posts[0].updated_at).toUTCString()}</lastBuildDate>` : ""}
${items.join("\n")}
  </channel>
</rss>
`;
    return xml(body, "application/rss+xml; charset=utf-8");
  });
}

export function OPTIONS() {
  return preflight();
}
