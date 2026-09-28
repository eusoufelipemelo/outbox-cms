import "server-only";
import { db } from "@/lib/supabase/admin";
import { draftFromArticle, publishIgPost } from "./compose";
import { igAccount } from "./oauth";

/**
 * Pacote completo (Blog + Google Empresas + Instagram): o artigo aprovado vira carrossel e/ou story,
 * conforme os formatos escolhidos para o cliente em Serviços. Devolve aviso só se falhar.
 */
export async function alsoOnInstagram(automationId: string, postId: string): Promise<string | null> {
  const { data } = await db().from("automations").select("client_id").eq("id", automationId).maybeSingle();
  const clientId = (data as { client_id: string } | null)?.client_id;
  if (!clientId) return null;
  const { data: client } = await db().from("clients").select("svc_blog_gbp, svc_instagram, ig_formats").eq("id", clientId).maybeSingle();
  const c = client as { svc_blog_gbp?: boolean; svc_instagram?: boolean; ig_formats?: string[] } | null;
  if (!c?.svc_blog_gbp || !c.svc_instagram) return null;
  if (!(await igAccount(clientId))) return "Instagram: o cliente ainda não conectou a conta.";
  try {
    const ids = await draftFromArticle(postId, clientId, c.ig_formats ?? ["carousel", "story"]);
    const results = [];
    for (const id of [ids.carouselId, ids.storyId].filter(Boolean) as string[]) results.push(await publishIgPost(id));
    const fails = results.filter((r) => !r.ok).map((r) => r.message);
    return fails.length ? `Instagram: ${fails.join("; ")}` : null;
  } catch (err) {
    return `Instagram: ${err instanceof Error ? err.message : "falha ao publicar"}`;
  }
}
