// Contrato do assistente de IA, compartilhado entre servidor (/api/ai) e cliente (callAi).

export type AiAction = "titles" | "outline" | "draft" | "improve" | "seo" | "variation";

export interface AiInput {
  /** Sugere títulos a partir de um tema. */
  titles: { topic: string; keyword?: string; clientId?: string };
  /** Estrutura de H2/H3 em HTML. */
  outline: { title: string; keyword?: string; clientId?: string };
  /** Artigo completo em HTML a partir do título (e esboço opcional). */
  draft: { title: string; outlineHtml?: string; keyword?: string; clientId?: string; words?: number };
  /** Reescreve um trecho/artigo seguindo uma instrução. */
  improve: { html: string; instruction: string };
  /** Metadados de SEO a partir do conteúdo. */
  seo: { title: string; html: string; keyword?: string };
  /** Versão do artigo adaptada ao cliente dono do site (tom, cidade, palavras-chave). */
  variation: { postId: string; siteId: string };
}

export interface AiOutput {
  titles: { titles: string[] };
  outline: { html: string };
  draft: { html: string };
  improve: { html: string };
  seo: { seo_title: string; seo_description: string; excerpt: string; slug: string };
  variation: { title: string; excerpt: string; content_html: string; seo_title: string; seo_description: string };
}

/** GET /api/ai */
export interface AiStatus {
  enabled: boolean;
  /** Modelo em uso (só quando `enabled`). */
  model?: string;
}

/** Corpo de resposta de POST /api/ai. */
export type AiResponse<A extends AiAction = AiAction> =
  | { ok: true; result: AiOutput[A] }
  | { ok: false; error: string };
