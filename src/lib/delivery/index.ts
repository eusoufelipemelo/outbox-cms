import "server-only";
import type { SitePlatform } from "@/lib/types";
import { joinUrl } from "@/lib/utils";

// STUB — implementado pelo módulo de entrega. Mantém as assinaturas do CLAUDE.md.

export type PublishResult = {
  siteId: string;
  siteName: string;
  ok: boolean;
  channel: SitePlatform;
  url: string | null;
  message: string;
};

export function siteArticleUrl(site: { url: string; blog_path: string }, slug: string): string {
  return joinUrl(site.url, site.blog_path, slug);
}

export async function publishPost(_postId: string, _opts?: { siteIds?: string[]; event?: "publish" | "update" }): Promise<PublishResult[]> {
  throw new Error("publishPost ainda não implementado");
}

export async function unpublishPost(_postId: string, _siteIds?: string[]): Promise<PublishResult[]> {
  throw new Error("unpublishPost ainda não implementado");
}

export async function testSiteConnection(_siteId: string): Promise<{ ok: boolean; message: string }> {
  throw new Error("testSiteConnection ainda não implementado");
}
