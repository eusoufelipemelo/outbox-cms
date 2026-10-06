import "server-only";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { aiEnabled, generate } from "@/lib/ai/server";
import { plainText } from "@/lib/ai/sanitize";
import { siteArticleUrl } from "@/lib/delivery/urls";
import { createArticlePost, hashtag, LinkedInError, littleText, uploadImage } from "./api";
import { liConnection } from "./oauth";

type Page = { id: string; org_urn: string; name: string };

const draftSchema = z.object({
  text: z.string().describe("Texto do post, em português do Brasil, sem links e sem hashtags."),
  hashtags: z.array(z.string()).describe("De 3 a 5 hashtags sem o símbolo #, em português, ligadas ao tema e ao nicho."),
});

/** Texto do post na voz da empresa, escrito a partir do artigo. Sem IA, usa o título e o resumo. */
async function compose(
  post: { title: string; excerpt: string | null; answer_summary: string | null },
  client: { name: string; segment: string | null; tone_of_voice: string | null } | null,
): Promise<string> {
  const summary = plainText(post.answer_summary || post.excerpt || "");
  if (aiEnabled()) {
    try {
      const out = await generate(
        draftSchema,
        {
          system: `Você escreve posts para a página de empresa de ${client?.name ?? "uma empresa"}${client?.segment ? ` (${client.segment})` : ""} na LinkedIn. ${client?.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}.` : "Tom profissional e próximo."}
Regras: comece com uma frase que prenda a atenção de quem decide a compra; depois 2 a 4 parágrafos curtos com o que o leitor aprende no artigo; termine convidando a ler o artigo completo no link abaixo. Entre 500 e 1.100 caracteres. Sem links, sem hashtags no texto, no máximo 2 emojis, sem promessas que a empresa não possa cumprir.`,
          user: `Título do artigo: ${post.title}\n\nResumo: ${summary || "(sem resumo)"}\n\nEscreva o post.`,
        },
        { maxTokens: 1500, timeoutMs: 60_000, effort: "low", task: "apoio" },
      );
      const tags = out.hashtags.map(hashtag).filter(Boolean).slice(0, 5).join(" ");
      return `${littleText(out.text.trim())}${tags ? `\n\n${tags}` : ""}`;
    } catch (err) {
      console.warn("[linkedin] texto pela IA falhou, usando o resumo:", err instanceof Error ? err.message : err);
    }
  }
  return littleText(`${post.title}\n\n${summary}\n\nLeia o artigo completo no link abaixo.`.trim());
}

/**
 * Publica um artigo que já está no ar nas páginas da LinkedIn ligadas ao cliente:
 * texto adaptado, cartão do artigo com a capa e link para o blog.
 */
export async function publishArticleToLinkedIn(postId: string, opts: { pageIds?: string[] } = {}): Promise<{ sent: number; failed: number; message: string }> {
  if (!liConnection().connected) return { sent: 0, failed: 0, message: "LinkedIn não conectada." };

  const { data: post } = await db().from("posts").select("id, title, excerpt, answer_summary, cover_image_url, slug").eq("id", postId).maybeSingle();
  if (!post) return { sent: 0, failed: 0, message: "Artigo não encontrado." };
  const p = post as { title: string; excerpt: string | null; answer_summary: string | null; cover_image_url: string | null; slug: string };

  const { data: links } = await db()
    .from("post_sites")
    .select("is_canonical, slug, external_url, site:sites(url, blog_path, client_id)")
    .eq("post_id", postId)
    .eq("status", "published");
  type Link = { is_canonical: boolean; slug: string | null; external_url: string | null; site: { url: string; blog_path: string; client_id: string } | { url: string; blog_path: string; client_id: string }[] | null };
  const live = ((links ?? []) as unknown as Link[])
    .map((l) => ({ ...l, site: Array.isArray(l.site) ? l.site[0] : l.site }))
    .filter((l) => l.site)
    .sort((a, b) => Number(b.is_canonical) - Number(a.is_canonical));
  if (!live.length) return { sent: 0, failed: 0, message: "O artigo ainda não está no ar em nenhum site." };
  const first = live[0];
  const url = first.external_url ?? siteArticleUrl(first.site!, first.slug ?? p.slug);
  const clientId = first.site!.client_id;

  let query = db().from("li_pages").select("id, org_urn, name").eq("client_id", clientId);
  if (opts.pageIds?.length) query = query.in("id", opts.pageIds);
  const { data: rows } = await query;
  const pages = (rows ?? []) as Page[];
  if (!pages.length) return { sent: 0, failed: 0, message: "Nenhuma página da LinkedIn ligada a este cliente." };

  const { data: client } = await db().from("clients").select("name, segment, tone_of_voice").eq("id", clientId).maybeSingle();
  const commentary = await compose(p, client as { name: string; segment: string | null; tone_of_voice: string | null } | null);
  const description = plainText(p.excerpt || p.answer_summary || "").slice(0, 300);

  let sent = 0;
  let failed = 0;
  let lastError = "";
  for (const page of pages) {
    try {
      let thumbnail: string | null = null;
      if (p.cover_image_url) {
        try {
          thumbnail = await uploadImage(page.org_urn, p.cover_image_url);
        } catch (err) {
          // sem capa o post sai assim mesmo, só com o cartão do link
          console.warn(`[linkedin] capa não enviada (${page.name}):`, err instanceof Error ? err.message : err);
        }
      }
      const urn = await createArticlePost({ author: page.org_urn, commentary, url, title: p.title, description, thumbnail });
      await db().from("li_posts").insert({ page_id: page.id, post_id: postId, li_urn: urn || null, status: "sent" });
      sent++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "falha";
      await db().from("li_posts").insert({ page_id: page.id, post_id: postId, status: "failed", error: lastError.slice(0, 500) });
      failed++;
      if (err instanceof LinkedInError && (err.status === 401 || err.status === 429)) break;
    }
  }
  return {
    sent,
    failed,
    message: failed ? `${sent} publicado(s), ${failed} com falha: ${lastError}` : `Publicado em ${sent} página(s) da LinkedIn`,
  };
}
