import "server-only";
import { db } from "@/lib/supabase/admin";
import { publishArticleToLinkedIn } from "./publish";
import { liConnection } from "./oauth";

/**
 * Cliente com Blog e LinkedIn: o artigo aprovado vira post na página da empresa.
 * Devolve um aviso só quando algo falha (página ainda não ligada não é alarme).
 */
export async function alsoOnLinkedIn(automationId: string, postId: string): Promise<string | null> {
  const { data } = await db().from("automations").select("client_id").eq("id", automationId).maybeSingle();
  const clientId = (data as { client_id: string } | null)?.client_id;
  if (!clientId) return null;
  const { data: client } = await db().from("clients").select("svc_blog_gbp, svc_linkedin").eq("id", clientId).maybeSingle();
  const c = client as { svc_blog_gbp?: boolean; svc_linkedin?: boolean } | null;
  if (!c?.svc_blog_gbp || !c.svc_linkedin) return null;
  if (!liConnection().connected) return "LinkedIn: a conta da OutBox ainda não está conectada.";
  const { count } = await db().from("li_pages").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  if (!count) return null;
  try {
    const r = await publishArticleToLinkedIn(postId);
    return r.sent && !r.failed ? null : `LinkedIn: ${r.message}`;
  } catch (err) {
    return `LinkedIn: ${err instanceof Error ? err.message : "falha ao publicar"}`;
  }
}
