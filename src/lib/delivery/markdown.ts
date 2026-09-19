// HTML do artigo → texto/markdown, sem dependências. Pensado para o HTML que o editor produz
// (já sanitizado: p, h2–h4, listas, blockquote, figure/img, pre/code, links, ênfases).
// Usado no llms-full.txt e para extrair passos de guias (HowTo) no JSON-LD.

export type HtmlNode =
  | { type: "text"; text: string }
  | { type: "el"; tag: string; attrs: Record<string, string>; children: HtmlNode[] };

type HtmlElement = Extract<HtmlNode, { type: "el" }>;

const VOID_TAGS = new Set(["br", "hr", "img", "wbr", "input", "meta", "link", "source", "col", "area"]);
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "figure",
  "figcaption",
  "table",
]);

const TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<|[^<]+/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  ordm: "º",
  ordf: "ª",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return match;
      try {
        return String.fromCodePoint(n);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Árvore simples do HTML. Tolerante: fechamentos sem abertura são ignorados. */
export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlElement = { type: "el", tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  for (const m of html.matchAll(TOKEN_RE)) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    const parent = stack[stack.length - 1];
    if (m[2] === undefined) {
      parent.children.push({ type: "text", text: decodeEntities(tok) });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const rawAttrs = m[3] ?? "";
    const el: HtmlElement = { type: "el", tag, attrs: parseAttrs(rawAttrs), children: [] };
    parent.children.push(el);
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(rawAttrs)) stack.push(el);
  }
  return root.children;
}

/** Texto corrido de um nó (espaços colapsados). */
export function textOf(nodes: HtmlNode | HtmlNode[]): string {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  let out = "";
  for (const n of list) {
    if (n.type === "text") out += n.text;
    else if (n.tag === "br") out += " ";
    else {
      const inner = textOf(n.children);
      out += BLOCK_TAGS.has(n.tag) ? ` ${inner} ` : inner;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Passos de um guia: itens da primeira lista numerada de primeiro nível do artigo.
 * Só retorna quando o formato é confiável (2 a 30 itens com texto de tamanho razoável).
 */
export function orderedListSteps(html: string): string[] | null {
  const ol = parseHtml(html).find((n): n is HtmlElement => n.type === "el" && n.tag === "ol");
  if (!ol) return null;
  const items = ol.children
    .filter((n): n is HtmlElement => n.type === "el" && n.tag === "li")
    .map((li) => textOf(li.children.filter((c) => !(c.type === "el" && (c.tag === "ul" || c.tag === "ol")))));
  if (items.length < 2 || items.length > 30) return null;
  if (items.some((t) => t.length < 3 || t.length > 800)) return null;
  return items;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

type Ctx = { headingOffset: number };

function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  const v = href.trim();
  return /^(https?:|mailto:|tel:)/i.test(v) ? v.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29") : null;
}

/** Texto seguro para dentro de [ ] de um link markdown. */
export function mdLinkText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/([[\]\\])/g, "\\$1").trim();
}

/** URL segura para dentro de ( ) de um link markdown. */
export function mdUrl(value: string): string {
  return value.trim().replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function wrap(marker: string, inner: string): string {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function inline(nodes: HtmlNode[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") {
      out += n.text.replace(/\s+/g, " ");
      continue;
    }
    switch (n.tag) {
      case "strong":
      case "b":
        out += wrap("**", inline(n.children));
        break;
      case "em":
      case "i":
        out += wrap("*", inline(n.children));
        break;
      case "s":
      case "del":
      case "strike":
        out += wrap("~~", inline(n.children));
        break;
      case "code": {
        const code = textOf(n.children);
        out += code ? `\`${code.replace(/`/g, "'")}\`` : "";
        break;
      }
      case "a": {
        const text = inline(n.children).trim();
        const href = safeHref(n.attrs.href);
        out += href && text ? `[${text.replace(/([[\]])/g, "\\$1")}](${href})` : text;
        break;
      }
      case "br":
        out += "\n";
        break;
      case "img": {
        const src = safeHref(n.attrs.src);
        out += src && /^https?:/i.test(src) ? `![${mdLinkText(n.attrs.alt ?? "")}](${src})` : "";
        break;
      }
      default:
        out += inline(n.children);
    }
  }
  return out;
}

/** Limpa espaços nas bordas das linhas de um bloco de texto. */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function list(el: HtmlElement, ctx: Ctx): string {
  const ordered = el.tag === "ol";
  const lines: string[] = [];
  let i = 0;
  for (const li of el.children) {
    if (li.type !== "el" || li.tag !== "li") continue;
    i++;
    const marker = ordered ? `${i}. ` : "- ";
    const indent = " ".repeat(marker.length);
    const body = blocks(li.children, ctx).join("\n");
    const [first = "", ...rest] = body.split("\n");
    lines.push(marker + first, ...rest.map((l) => (l ? indent + l : l)));
  }
  return lines.join("\n");
}

function block(el: HtmlElement, ctx: Ctx): string {
  switch (el.tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = tidy(inline(el.children)).replace(/\n+/g, " ");
      if (!text) return "";
      const level = Math.min(6, Math.max(1, Number(el.tag[1]) + ctx.headingOffset));
      return `${"#".repeat(level)} ${text}`;
    }
    case "ul":
    case "ol":
      return list(el, ctx);
    case "blockquote":
      return blocks(el.children, ctx)
        .join("\n\n")
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    case "pre": {
      const code = el.children.map((c) => (c.type === "text" ? c.text : textOfRaw(c))).join("");
      return code.trim() ? `\`\`\`\n${code.replace(/\n+$/, "").replace(/```/g, "'''")}\n\`\`\`` : "";
    }
    case "hr":
      return "---";
    case "figcaption": {
      const text = tidy(inline(el.children));
      return text ? `*${text}*` : "";
    }
    case "li":
      return list({ ...el, tag: "ul", children: [el] }, ctx);
    default:
      // p, div, figure, section, table...: o conteúdo decide (inline ou blocos)
      return blocks(el.children, ctx).join("\n\n");
  }
}

function textOfRaw(node: HtmlNode): string {
  if (node.type === "text") return node.text;
  if (node.tag === "br") return "\n";
  return node.children.map(textOfRaw).join("");
}

function blocks(nodes: HtmlNode[], ctx: Ctx): string[] {
  const out: string[] = [];
  let buffer: HtmlNode[] = [];
  const flush = () => {
    const text = tidy(inline(buffer));
    if (text) out.push(text);
    buffer = [];
  };
  for (const n of nodes) {
    if (n.type === "el" && BLOCK_TAGS.has(n.tag)) {
      flush();
      const b = block(n, ctx);
      if (b.trim()) out.push(b);
    } else {
      buffer.push(n);
    }
  }
  flush();
  return out;
}

/**
 * Converte o HTML do artigo em markdown. `headingOffset` rebaixa os títulos
 * (ex.: 1 transforma h2 em ###, para caber sob o título do artigo).
 */
export function htmlToMarkdown(html: string, opts: { headingOffset?: number } = {}): string {
  const ctx: Ctx = { headingOffset: opts.headingOffset ?? 0 };
  return blocks(parseHtml(html), ctx)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
