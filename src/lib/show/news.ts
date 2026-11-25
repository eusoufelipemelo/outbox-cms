import "server-only";

/**
 * Notícias de IA do dia, lidas direto das fontes (RSS/Atom). A IA de texto não sabe o que aconteceu
 * ontem: os posts do programa só falam do que está nesta lista, com o link da fonte.
 */

export type NewsItem = { title: string; summary: string; link: string; source: string; published: string };

/** `onlyAi`: site de tecnologia geral, então só entram itens que falam de IA. */
const FEEDS: { url: string; source: string; onlyAi?: boolean }[] = [
  { url: "https://openai.com/news/rss.xml", source: "OpenAI" },
  { url: "https://blog.google/technology/ai/rss/", source: "Google" },
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", source: "MIT Technology Review" },
  { url: "https://www.wired.com/feed/tag/ai/latest/rss", source: "Wired" },
  { url: "https://the-decoder.com/feed/", source: "The Decoder" },
  { url: "https://tecnoblog.net/feed/", source: "Tecnoblog", onlyAi: true },
  { url: "https://olhardigital.com.br/feed/", source: "Olhar Digital", onlyAi: true },
  { url: "https://canaltech.com.br/rss/", source: "Canaltech", onlyAi: true },
  { url: "https://news.google.com/rss/search?q=intelig%C3%AAncia+artificial&hl=pt-BR&gl=BR&ceid=BR:pt-419", source: "Google Notícias" },
];

const AI_WORDS = /\b(ia|i\.a\.|intelig[eê]ncia artificial|ai|chatgpt|openai|gemini|claude|anthropic|copilot|llm|agente[s]? de ia|deepseek|grok|midjourney|sora|nano banana|veo|perplexity|nvidia)\b/i;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

function parse(xml: string, feed: (typeof FEEDS)[number]): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const b of blocks.slice(0, 60)) {
    let title = decode(tag(b, "title"));
    let source = feed.source;
    // Google Notícias: "Título - Veículo"
    if (feed.source === "Google Notícias") {
      const src = decode(tag(b, "source"));
      if (src) {
        source = src;
        title = title.replace(new RegExp(`\\s+-\\s+${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
      }
    }
    const link = decode(tag(b, "link")) || b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    const published = decode(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const summary = decode(tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400);
    if (!title || !link) continue;
    if (feed.onlyAi && !AI_WORDS.test(`${title} ${summary}`)) continue;
    out.push({ title, summary, link, source, published });
  }
  return out;
}

async function readFeed(feed: (typeof FEEDS)[number]): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; OutBoxCMS/1.0)", accept: "application/rss+xml, application/atom+xml, text/xml, */*" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parse((await res.text()).slice(0, 3_000_000), feed);
  } catch {
    return [];
  }
}

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").slice(0, 60);

/** Notícias de IA das últimas `hours` horas, das mais novas para as mais antigas, sem repetidas. */
export async function latestAiNews(hours = 48, limit = 40): Promise<NewsItem[]> {
  const since = Date.now() - hours * 3_600_000;
  const all = (await Promise.all(FEEDS.map(readFeed))).flat();
  const seen = new Set<string>();
  return all
    .map((n) => ({ n, t: Date.parse(n.published) || 0 }))
    .filter(({ t }) => t >= since)
    .sort((a, b) => b.t - a.t)
    .map(({ n }) => n)
    .filter((n) => {
      const k = norm(n.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
