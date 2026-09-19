import "server-only";
import { organizationName, type ContentSite, type PostSummary, type PublicPost } from "@/lib/content";
import { htmlToMarkdown, mdLinkText, mdUrl } from "@/lib/delivery/markdown";
import { joinUrl } from "@/lib/utils";

// llms.txt (convenção llmstxt.org) e llms-full.txt: resumo da empresa e dos artigos em markdown,
// para assistentes de IA entenderem e citarem o site.

function oneLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sentence(value: string): string {
  const v = oneLine(value);
  return !v || /[.!?…]$/.test(v) ? v : `${v}.`;
}

function link(title: string, url: string): string {
  return `[${mdLinkText(title) || url}](${mdUrl(url)})`;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** Blockquote de abertura: o que a empresa faz e onde atende. */
function summaryLine(site: ContentSite): string {
  const c = site.client;
  const parts: string[] = [];
  if (c?.about) parts.push(sentence(c.about));
  const area = c?.service_area ?? (c?.city ? [c.city, c.state].filter(Boolean).join(" - ") : null);
  if (area) parts.push(sentence(`Atende ${area}`));
  if (!parts.length) parts.push(sentence(`Artigos e informações de ${organizationName(site)}`));
  return `> ${parts.join(" ")}`;
}

function contactLines(site: ContentSite): string[] {
  const c = site.client;
  const root = site.url.replace(/\/+$/, "");
  const lines = [`- Site: ${link(root, root)}`];
  if (c?.phone) lines.push(`- Telefone: ${oneLine(c.phone)}`);
  const address = [c?.address, [c?.city, c?.state].filter(Boolean).join(" - ")].map(oneLine).filter(Boolean);
  if (address.length) lines.push(`- Endereço: ${[...new Set(address)].join(", ")}`);
  if (c?.opening_hours) lines.push(`- Horário de atendimento: ${oneLine(c.opening_hours)}`);
  if (c?.service_area) lines.push(`- Área de atendimento: ${oneLine(c.service_area)}`);
  if (c?.expert_name) {
    lines.push(`- Especialista responsável: ${[c.expert_name, c.expert_credentials].map(oneLine).filter(Boolean).join(", ")}`);
  }
  for (const url of c?.social_links ?? []) {
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* mantém a URL */
    }
    lines.push(`- ${link(label, url)}`);
  }
  return lines;
}

/** GET /api/v1/llms.txt */
export function buildLlmsTxt(site: ContentSite, posts: PostSummary[]): string {
  const name = organizationName(site);
  const blogUrl = joinUrl(site.url, site.blog_path);
  const out: string[] = [`# ${oneLine(name)}`, "", summaryLine(site), ""];
  out.push(`Blog com artigos da empresa: ${link(blogUrl, blogUrl)}`, "");

  const services = site.client?.services ?? [];
  if (services.length) {
    out.push("## Serviços", "", ...services.map((s) => `- ${oneLine(s)}`), "");
  }

  out.push("## Artigos", "");
  if (posts.length) {
    for (const p of posts) {
      const desc = oneLine(p.answer_summary || p.excerpt);
      out.push(`- ${link(p.title, p.url)}${desc ? `: ${desc}` : ""}`);
    }
  } else {
    out.push("- Nenhum artigo publicado ainda.");
  }
  out.push("", "## Contato", "", ...contactLines(site), "");
  return out.join("\n");
}

function articleMarkdown(p: PublicPost): string {
  const out: string[] = [`## ${oneLine(p.title)}`, ""];
  const meta = [`- URL: ${p.url}`];
  const published = isoDate(p.published_at);
  const updated = isoDate(p.updated_at);
  if (published) meta.push(`- Publicado em: ${published}`);
  if (updated) meta.push(`- Atualizado em: ${updated}`);
  if (p.author_profile) {
    meta.push(`- Autor: ${[p.author_profile.name, p.author_profile.credentials].map(oneLine).filter(Boolean).join(", ")}`);
  }
  if (p.category) meta.push(`- Categoria: ${oneLine(p.category)}`);
  out.push(...meta, "");

  if (p.answer_summary) out.push(`**Resposta direta:** ${oneLine(p.answer_summary)}`, "");
  if (p.key_takeaways.length) {
    out.push("### Pontos principais", "", ...p.key_takeaways.map((t) => `- ${oneLine(t)}`), "");
  }

  const body = htmlToMarkdown(p.content_html, { headingOffset: 1 });
  if (body) out.push(body, "");

  if (p.faq.length) {
    out.push("### Perguntas frequentes", "");
    for (const f of p.faq) out.push(`#### ${oneLine(f.question)}`, "", f.answer.trim(), "");
  }
  if (p.sources.length) {
    out.push("### Fontes", "");
    for (const s of p.sources) out.push(`- ${link(s.title, s.url)}${s.publisher ? ` (${oneLine(s.publisher)})` : ""}`);
    out.push("");
  }
  return out.join("\n");
}

/** GET /api/v1/llms-full.txt */
export function buildLlmsFullTxt(site: ContentSite, posts: PublicPost[]): string {
  const name = organizationName(site);
  const blogUrl = joinUrl(site.url, site.blog_path);
  const out: string[] = [`# ${oneLine(name)}: artigos completos`, "", summaryLine(site), ""];
  out.push(
    posts.length > 1
      ? `Texto completo dos ${posts.length} artigos mais recentes publicados em ${link(blogUrl, blogUrl)}.`
      : posts.length === 1
        ? `Texto completo do artigo publicado em ${link(blogUrl, blogUrl)}.`
        : `Nenhum artigo publicado ainda em ${link(blogUrl, blogUrl)}.`,
    "",
  );
  for (const p of posts) out.push("---", "", articleMarkdown(p));
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
