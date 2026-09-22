// Contrato do assistente de IA, compartilhado entre servidor (/api/ai) e cliente (callAi).

import type { ContentType, FaqItem, SourceItem } from "@/lib/types";

export type AiAction = "titles" | "outline" | "draft" | "improve" | "seo" | "variation" | "geo" | "full_article" | "ideas";

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
  /** Blocos de GEO a partir de um artigo pronto: resposta direta, pontos principais, FAQ e tipo. */
  geo: { title: string; html: string; keyword?: string; clientId?: string };
  /** Um clique: artigo completo pronto para SEO + GEO a partir de um tema. */
  full_article: { topic: string; keyword?: string; clientId?: string; contentType?: ContentType; words?: number };
  /** Pautas: ideias de artigos para um cliente (nicho, cidade, serviços, palavras-chave). */
  ideas: { clientId: string; count?: number; focus?: string };
}

export interface AiOutput {
  titles: { titles: string[] };
  outline: { html: string };
  draft: { html: string };
  improve: { html: string };
  seo: { seo_title: string; seo_description: string; excerpt: string; slug: string };
  variation: {
    title: string;
    excerpt: string;
    content_html: string;
    seo_title: string;
    seo_description: string;
    answer_summary: string;
    faq: FaqItem[];
  };
  geo: { answer_summary: string; key_takeaways: string[]; faq: FaqItem[]; content_type: ContentType };
  full_article: {
    title: string;
    slug: string;
    excerpt: string;
    content_html: string;
    answer_summary: string;
    key_takeaways: string[];
    faq: FaqItem[];
    seo_title: string;
    seo_description: string;
    focus_keyword: string;
    content_type: ContentType;
    /** O que citar como fonte (descrições para o redator verificar). A IA nunca inventa URLs. */
    source_suggestions: string[];
    /** Fontes reais encontradas pela busca na web (URL conferida nos resultados da busca). */
    sources?: SourceItem[];
    /** Autor sugerido: especialista do cliente ou quem está usando o CMS. */
    author_name?: string | null;
    /** Itens do checklist de SEO/GEO que ainda não passaram (vazio = 10 de 10 em ambos). */
    pending_checks?: string[];
  };
  ideas: {
    ideas: {
      title: string;
      keyword: string;
      intent: "informacional" | "comercial" | "local" | "comparativa";
      content_type: ContentType;
      angle: string;
    }[];
  };
}

/** GET /api/ai */
export interface AiStatus {
  enabled: boolean;
  /** Modelo em uso (só quando `enabled`). */
  model?: string;
  /** Provedor do texto: OpenRouter ou Anthropic. */
  provider?: "openrouter" | "anthropic";
}

/** Corpo de resposta de POST /api/ai. */
export type AiResponse<A extends AiAction = AiAction> =
  | { ok: true; result: AiOutput[A] }
  | { ok: false; error: string };
