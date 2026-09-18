import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Limpa o HTML de artigo antes de gravar (e antes de renderizar a pré-visualização).
 * Só as tags que o editor produz; links e imagens apenas com esquemas seguros.
 */
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h2",
    "h3",
    "h4",
    "strong",
    "em",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "img",
    "figure",
    "figcaption",
    "hr",
    "br",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  // conteúdo de tags perigosas é descartado por inteiro
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object"],
  transformTags: {
    // equivalentes que colagens trazem de outros editores
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    h1: "h2",
    h5: "h4",
    h6: "h4",
    a: (tagName, attribs) => {
      const next: Record<string, string> = {};
      if (attribs.href) next.href = attribs.href;
      if (attribs.target === "_blank") {
        next.target = "_blank";
        const rel = new Set((attribs.rel ?? "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        next.rel = [...rel].join(" ");
      } else if (attribs.rel) {
        next.rel = attribs.rel;
      }
      return { tagName, attribs: next };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
};

export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, options).trim();
}

