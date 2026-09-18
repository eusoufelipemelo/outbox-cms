// Snippets de integração pré-preenchidos com a chave do site. Strings puras (renderizadas em <CopyField>).

export type SnippetSite = {
  id: string;
  name: string;
  url: string;
  blog_path: string;
  public_key: string;
};

function blogFolder(blogPath: string): string {
  const clean = blogPath.replace(/^\/+|\/+$/g, "");
  return clean || "blog";
}

export function embedSnippet(appUrl: string, key: string): string {
  return `<div id="outbox-blog"></div>
<script src="${appUrl}/embed.js" data-key="${key}" async></script>`;
}

export function embedOptionsSnippet(appUrl: string, key: string): string {
  return `<div id="blog-da-empresa"></div>
<script
  src="${appUrl}/embed.js"
  data-key="${key}"
  data-target="#blog-da-empresa"
  data-per-page="6"
  data-accent="#0f766e"
  async
></script>`;
}

export function nextEnvSnippet(appUrl: string, key: string): string {
  return `# .env.local
OUTBOX_API_URL=${appUrl}/api/v1
OUTBOX_KEY=${key}
# Segredo do webhook: copie na página do site no OutBox CMS
OUTBOX_WEBHOOK_SECRET=`;
}

export function nextLibSnippet(): string {
  return `// lib/outbox.ts
const API = process.env.OUTBOX_API_URL!;
const KEY = process.env.OUTBOX_KEY!;

export type OutboxPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image: { url: string; alt: string } | null;
  category: string | null;
  tags: string[];
  author: string | null;
  published_at: string | null;
  updated_at: string;
  reading_minutes: number;
  url: string;
};

export type OutboxPost = OutboxPostSummary & {
  content_html: string;
  seo: { title: string; description: string; canonical_url: string; og_image: string | null };
  json_ld: Record<string, unknown>;
};

async function outbox<T>(path: string): Promise<T | null> {
  const res = await fetch(\`\${API}\${path}\`, {
    headers: { "x-outbox-key": KEY },
    // O webhook chama revalidatePath na hora; 5 min é só a rede de segurança.
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(\`OutBox CMS respondeu HTTP \${res.status}\`);
  return res.json();
}

export async function getPosts(page = 1, perPage = 12) {
  return outbox<{
    data: OutboxPostSummary[];
    meta: { page: number; per_page: number; total: number; total_pages: number };
  }>(\`/posts?page=\${page}&per_page=\${perPage}\`);
}

export async function getPost(slug: string) {
  return outbox<OutboxPost>(\`/posts/\${encodeURIComponent(slug)}\`);
}`;
}

export function nextListPageSnippet(blogPath: string): string {
  const folder = blogFolder(blogPath);
  return `// app/${folder}/page.tsx
import Link from "next/link";
import { getPosts } from "@/lib/outbox";

export const metadata = { title: "Blog" };

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  const page = Number(pagina) || 1;
  const result = await getPosts(page);
  const posts = result?.data ?? [];

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={\`/${folder}/\${post.slug}\`}>
              {post.cover_image && <img src={post.cover_image.url} alt={post.cover_image.alt} />}
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}`;
}

export function nextPostPageSnippet(blogPath: string): string {
  const folder = blogFolder(blogPath);
  return `// app/${folder}/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/outbox";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.seo.title,
    description: post.seo.description,
    alternates: { canonical: post.seo.canonical_url },
    openGraph: {
      type: "article",
      title: post.seo.title,
      description: post.seo.description,
      images: post.seo.og_image ? [post.seo.og_image] : [],
      publishedTime: post.published_at ?? undefined,
    },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(post.json_ld).replace(/</g, "\\\\u003c") }}
      />
      <h1>{post.title}</h1>
      {post.cover_image && <img src={post.cover_image.url} alt={post.cover_image.alt} />}
      {/* HTML já sanitizado pelo OutBox CMS */}
      <div dangerouslySetInnerHTML={{ __html: post.content_html }} />
    </article>
  );
}`;
}

export function nextWebhookSnippet(blogPath: string): string {
  const folder = blogFolder(blogPath);
  return `// app/api/outbox-webhook/route.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const raw = await request.text();
  const received = request.headers.get("x-outbox-signature") ?? "";
  const expected =
    "sha256=" + createHmac("sha256", process.env.OUTBOX_WEBHOOK_SECRET!).update(raw).digest("hex");

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const { event, post } = JSON.parse(raw);
  if (event !== "test") {
    revalidatePath("/${folder}");
    if (post?.slug) revalidatePath(\`/${folder}/\${post.slug}\`);
  }
  return Response.json({ ok: true });
}`;
}

export function webhookPayloadSnippet(site: SnippetSite, articleUrl: string): string {
  const now = "2026-01-15T13:00:00.000Z";
  const payload = {
    event: "publish",
    sent_at: now,
    site: { id: site.id, name: site.name, url: site.url },
    post: {
      id: "7b1f2c1e-0000-4000-8000-000000000000",
      slug: "como-escolher-o-melhor-armario",
      title: "Como escolher o melhor armário",
      excerpt: "Um guia rápido para acertar na escolha.",
      content_html: "<p>…</p>",
      cover_image: { url: "https://…/capa.jpg", alt: "Armário planejado" },
      category: "Dicas",
      tags: ["armário", "planejados"],
      author: "Equipe",
      published_at: now,
      updated_at: now,
      reading_minutes: 4,
      url: articleUrl,
      seo: { title: "…", description: "…", canonical_url: articleUrl, og_image: "https://…/capa.jpg" },
      json_ld: { "@context": "https://schema.org", "@type": "BlogPosting" },
    },
  };
  return `POST <sua URL de webhook>
Content-Type: application/json
User-Agent: OutBox-CMS/1.0
X-OutBox-Event: publish
X-OutBox-Signature: sha256=<HMAC-SHA256 do corpo com o segredo do site>

${JSON.stringify(payload, null, 2)}`;
}

export function webhookNodeSnippet(): string {
  return `// Node.js (Express, Fastify, serverless...) — use o corpo bruto, antes do JSON.parse
import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidOutboxSignature(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader || "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Express:
// app.post("/outbox-webhook", express.raw({ type: "application/json" }), (req, res) => {
//   if (!isValidOutboxSignature(req.body, req.get("x-outbox-signature"), process.env.OUTBOX_WEBHOOK_SECRET)) {
//     return res.status(401).json({ error: "Assinatura inválida" });
//   }
//   const { event, post } = JSON.parse(req.body.toString("utf8"));
//   // event: publish | update | unpublish | test
//   res.json({ ok: true });
// });`;
}

export function webhookPhpSnippet(): string {
  return `<?php
// outbox-webhook.php
$secret = getenv('OUTBOX_WEBHOOK_SECRET');
$raw = file_get_contents('php://input');
$expected = 'sha256=' . hash_hmac('sha256', $raw, $secret);
$received = $_SERVER['HTTP_X_OUTBOX_SIGNATURE'] ?? '';

if (!hash_equals($expected, $received)) {
    http_response_code(401);
    exit(json_encode(['error' => 'Assinatura inválida']));
}

$payload = json_decode($raw, true);
// $payload['event']: publish | update | unpublish | test
// $payload['post']['slug'], $payload['post']['content_html'], ...

header('Content-Type: application/json');
echo json_encode(['ok' => true]);`;
}

export function curlSnippets(appUrl: string, key: string): { title: string; code: string }[] {
  const api = `${appUrl}/api/v1`;
  return [
    {
      title: "Listar artigos (paginado, filtros opcionais: category, tag, q)",
      code: `curl "${api}/posts?key=${key}&page=1&per_page=12"`,
    },
    {
      title: "Artigo completo pelo slug (com seo e json_ld)",
      code: `curl -H "x-outbox-key: ${key}" "${api}/posts/como-escolher-o-melhor-armario"`,
    },
    { title: "Categorias e tags com contagem", code: `curl -H "Authorization: Bearer ${key}" "${api}/categories"` },
    { title: "Sitemap XML dos artigos", code: `curl "${api}/sitemap.xml?key=${key}"` },
    { title: "Feed RSS 2.0", code: `curl "${api}/feed.xml?key=${key}"` },
    {
      title: "Registrar uma visualização",
      code: `curl -X POST "${api}/posts/como-escolher-o-melhor-armario/view?key=${key}"`,
    },
  ];
}
