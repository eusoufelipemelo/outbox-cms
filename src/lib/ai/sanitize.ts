import "server-only";
import sanitizeHtml from "sanitize-html";

// Todo HTML que sai do assistente passa por aqui antes de chegar ao editor.

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "a", "blockquote"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // Normaliza o que o modelo possa ter usado no lugar das tags permitidas.
  transformTags: {
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    b: "strong",
    i: "em",
  },
  // Remove parágrafos/itens/títulos vazios que sobram da limpeza.
  exclusiveFilter: (frame) =>
    ["p", "li", "h2", "h3", "strong", "em", "blockquote"].includes(frame.tag) &&
    !frame.text.trim() &&
    !frame.mediaChildren.length,
};

/** Limpa HTML gerado pela IA: só h2, h3, p, ul, ol, li, strong, em, a[href], blockquote. */
export function sanitizeAiHtml(html: string): string {
  const unfenced = html
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");
  return sanitizeHtml(unfenced, OPTIONS)
    // Link cujo href foi removido (javascript:, relativo inválido...) vira texto simples.
    .replace(/<a>([\s\S]*?)<\/a>/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Versão do conteúdo enviada ao modelo: mesma lista de tags, preserva links; economiza tokens. */
export function htmlForPrompt(html: string): string {
  return sanitizeHtml(html, { ...OPTIONS, exclusiveFilter: undefined }).trim();
}

/** Texto puro (para títulos, resumos e metadados). */
export function plainText(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
