// Tipos compartilhados entre o editor (cliente), as consultas e as server actions de artigos.
import type { PostStatus, PublicationStatus, SitePlatform } from "@/lib/types";
import type { PublishResult } from "@/lib/delivery";

export type { PublishResult };

/** Site de destino, sem nenhum segredo (nada de wp_app_password / webhook_secret). */
export interface DestinationSite {
  id: string;
  name: string;
  url: string;
  blog_path: string;
  platform: SitePlatform;
  status: "active" | "paused";
  client: { id: string; name: string; brand_color: string | null; city: string | null; state: string | null };
}

/** Estado da publicação de um artigo em um site (linha de post_sites). */
export interface Publication {
  siteId: string;
  status: PublicationStatus;
  isCanonical: boolean;
  externalUrl: string | null;
  lastError: string | null;
  publishedAt: string | null;
}

/** Destino escolhido no editor + variação do texto para aquele site. Strings vazias = sem variação. */
export interface DestinationDraft {
  siteId: string;
  isCanonical: boolean;
  overrideTitle: string;
  overrideExcerpt: string;
  overrideContentHtml: string;
  overrideSeoTitle: string;
  overrideSeoDescription: string;
}

export interface RevisionItem {
  id: string;
  createdAt: string;
  authorName: string | null;
  title: string | null;
}

/** Dados que o editor recebe do servidor para um artigo existente. */
export interface EditorPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string;
  coverImageAlt: string;
  category: string;
  tags: string[];
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  destinations: DestinationDraft[];
  publications: Publication[];
  revisions: RevisionItem[];
}

/** Payload de savePost. */
export interface SavePostInput {
  id?: string | null;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  contentJson?: unknown;
  coverImageUrl: string;
  coverImageAlt: string;
  category: string;
  tags: string[];
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  /** ISO com fuso, ou null. */
  scheduledAt: string | null;
  sites: DestinationDraft[];
}

export interface SaveOutcome {
  id: string;
  savedAt: string;
  slug: string;
  status: PostStatus;
  publications: Publication[];
  revision: RevisionItem | null;
}

export interface PublishOutcome extends SaveOutcome {
  results: PublishResult[];
  publishedAt: string | null;
  event: "publish" | "update";
}

export interface RestoredRevision {
  title: string;
  contentHtml: string;
  seoTitle: string;
  seoDescription: string;
  savedAt: string;
  revisions: RevisionItem[];
}
