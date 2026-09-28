import "server-only";
import { db } from "@/lib/supabase/admin";
import { draftFromArticle, publishIgPost } from "./compose";
import { igAccount } from "./oauth";

/** Automação: quando o artigo vai ao ar, gera e publica carrossel + story. Devolve aviso só se falhar. */
export async function alsoOnInstagram(automationId: string, postId: string): Promise<string | null> {
  const { data } = await db().from("automations").select("ig_post, client_id").eq("id", automationId).maybeSingle();
  const a = data as { ig_post?: boolean; client_id: string } | null;
  if (!a?.ig_post) return null;
  if (!(await igAccount(a.client_id))) return "Instagram: o cliente ainda não conectou a conta.";
  try {
    const { carouselId, storyId } = await draftFromArticle(postId, a.client_id);
    const feed = await publishIgPost(carouselId);
    const story = await publishIgPost(storyId);
    const fails = [feed, story].filter((r) => !r.ok).map((r) => r.message);
    return fails.length ? `Instagram: ${fails.join("; ")}` : null;
  } catch (err) {
    return `Instagram: ${err instanceof Error ? err.message : "falha ao publicar"}`;
  }
}
