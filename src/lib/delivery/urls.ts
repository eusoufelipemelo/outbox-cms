import { joinUrl } from "@/lib/utils";

/** URL pública do artigo no site do cliente: {url}{blog_path}/{slug}. */
export function siteArticleUrl(site: { url: string; blog_path: string }, slug: string): string {
  return joinUrl(site.url, site.blog_path, slug);
}
