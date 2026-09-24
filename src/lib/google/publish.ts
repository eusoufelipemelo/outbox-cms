import "server-only";
import { db } from "@/lib/supabase/admin";
import { siteArticleUrl } from "@/lib/delivery/urls";
import { plainText } from "@/lib/ai/sanitize";
import { createPost, GbpError } from "./gbp";
import { googleConnection } from "./oauth";

type Loc = { id: string; account_name: string; location_name: string; title: string };

/**
 * Publica um artigo que já está no ar como "Novidade" nos perfis do Google Empresas do cliente:
 * resumo do artigo, capa e botão "Saiba mais" levando ao blog.
 */
export async function publishArticleToGbp(postId: string, opts: { locationIds?: string[] } = {}): Promise<{ sent: number; failed: number; message: string }> {
  if (!googleConnection().connected) return { sent: 0, failed: 0, message: "Google Empresas não conectado." };

  const { data: post } = await db()
    .from("posts")
    .select("id, title, excerpt, answer_summary, cover_image_url, slug")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { sent: 0, failed: 0, message: "Artigo não encontrado." };

  // onde o artigo está no ar (o canônico primeiro) e de qual cliente ele é
  const { data: links } = await db()
    .from("post_sites")
    .select("status, is_canonical, slug, external_url, site:sites(url, blog_path, client_id)")
    .eq("post_id", postId)
    .eq("status", "published");
  type Link = { is_canonical: boolean; slug: string | null; external_url: string | null; site: { url: string; blog_path: string; client_id: string } | { url: string; blog_path: string; client_id: string }[] | null };
  const live = ((links ?? []) as unknown as Link[])
    .map((l) => ({ ...l, site: Array.isArray(l.site) ? l.site[0] : l.site }))
    .filter((l) => l.site)
    .sort((a, b) => Number(b.is_canonical) - Number(a.is_canonical));
  if (!live.length) return { sent: 0, failed: 0, message: "O artigo ainda não está no ar em nenhum site." };
  const first = live[0];
  const url = first.external_url ?? siteArticleUrl(first.site!, first.slug ?? (post as { slug: string }).slug);
  const clientId = first.site!.client_id;

  let query = db().from("gbp_locations").select("id, account_name, location_name, title").eq("client_id", clientId);
  if (opts.locationIds?.length) query = query.in("id", opts.locationIds);
  const { data: locs } = await query;
  const locations = (locs ?? []) as Loc[];
  if (!locations.length) return { sent: 0, failed: 0, message: "Nenhum perfil do Google Empresas ligado a este cliente." };

  const p = post as { title: string; excerpt: string | null; answer_summary: string | null; cover_image_url: string | null };
  const summary = `${p.title}\n\n${plainText(p.answer_summary || p.excerpt || "")}`.trim();

  let sent = 0;
  let failed = 0;
  let lastError = "";
  for (const loc of locations) {
    try {
      const r = await createPost(loc.account_name, loc.location_name, { summary, url, photoUrl: p.cover_image_url });
      await db().from("gbp_posts").insert({ location_id: loc.id, post_id: postId, gbp_name: r.name, status: "sent" });
      sent++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "falha";
      await db().from("gbp_posts").insert({ location_id: loc.id, post_id: postId, status: "failed", error: lastError.slice(0, 500) });
      failed++;
      if (err instanceof GbpError && (err.status === 429 || err.status === 401)) break;
    }
  }
  return {
    sent,
    failed,
    message: failed ? `${sent} publicado(s), ${failed} com falha: ${lastError}` : `Publicado em ${sent} perfil(is) do Google Empresas`,
  };
}
