import "server-only";
import { db } from "@/lib/supabase/admin";

/** Um registro do vaivém de aprovação do artigo (quem fez o quê, e o recado quando houver). */
export type ApprovalEvent = { at: string; by: "cliente" | "equipe" | "automacao"; kind: "enviado" | "ajustes" | "aprovado" | "refeito"; text?: string };

type Fields = {
  approval_status?: "awaiting" | "changes" | "approved" | null;
  approval_client_id?: string | null;
  approval_feedback?: string | null;
  approval_requested_at?: string | null;
  approval_decided_at?: string | null;
};

/** Atualiza o status de aprovação do artigo e acrescenta o evento ao histórico. */
export async function recordApproval(postId: string, fields: Fields, event: Omit<ApprovalEvent, "at">): Promise<void> {
  const { data } = await db().from("posts").select("approval_history").eq("id", postId).maybeSingle();
  const history = (((data as { approval_history?: ApprovalEvent[] } | null)?.approval_history ?? []) as ApprovalEvent[]).slice(-49);
  history.push({ at: new Date().toISOString(), ...event, ...(event.text ? { text: event.text.slice(0, 2000) } : {}) });
  await db().from("posts").update({ ...fields, approval_history: history }).eq("id", postId);
}
