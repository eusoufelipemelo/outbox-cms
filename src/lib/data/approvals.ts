import "server-only";
import { db } from "@/lib/supabase/admin";
import type { ApprovalEvent } from "@/lib/approval/history";

export type PostApproval = {
  status: "awaiting" | "changes" | "approved" | "rejected" | null;
  feedback: string | null;
  history: ApprovalEvent[];
  clientName: string | null;
  requestedAt: string | null;
};

const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function getPostApproval(postId: string): Promise<PostApproval> {
  const { data } = await db()
    .from("posts")
    .select("approval_status, approval_feedback, approval_history, approval_requested_at, clients:approval_client_id(name)")
    .eq("id", postId)
    .maybeSingle();
  const r = data as {
    approval_status: PostApproval["status"];
    approval_feedback: string | null;
    approval_history: ApprovalEvent[] | null;
    approval_requested_at: string | null;
    clients: { name: string } | { name: string }[] | null;
  } | null;
  return {
    status: r?.approval_status ?? null,
    feedback: r?.approval_feedback ?? null,
    history: r?.approval_history ?? [],
    clientName: one(r?.clients ?? null)?.name ?? null,
    requestedAt: r?.approval_requested_at ?? null,
  };
}

export type ChangeRequest = { postId: string; title: string; clientName: string; feedback: string | null; at: string | null; kind: "changes" | "rejected" };

/** Pedidos de ajuste e recusas dos clientes que a equipe ainda não resolveu. */
export async function listChangeRequests(limit = 20): Promise<ChangeRequest[]> {
  const { data } = await db()
    .from("posts")
    .select("id, title, approval_status, approval_feedback, approval_decided_at, clients:approval_client_id(name)")
    .in("approval_status", ["changes", "rejected"])
    .neq("status", "published")
    .order("approval_decided_at", { ascending: false })
    .limit(limit);
  type Row = { id: string; title: string; approval_status: "changes" | "rejected"; approval_feedback: string | null; approval_decided_at: string | null; clients: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    postId: r.id,
    title: r.title,
    clientName: one(r.clients)?.name ?? "Cliente",
    feedback: r.approval_feedback,
    at: r.approval_decided_at,
    kind: r.approval_status,
  }));
}

export async function countChangeRequests(): Promise<number> {
  const { count } = await db().from("posts").select("id", { count: "exact", head: true }).in("approval_status", ["changes", "rejected"]).neq("status", "published");
  return count ?? 0;
}

export type SuggestedTopic = { id: string; clientId: string; clientName: string; title: string; notes: string | null; author: string | null; at: string };

/** Temas que os clientes mandaram pela área do cliente e ainda não viraram artigo. */
export async function listSuggestedTopics(limit = 20): Promise<SuggestedTopic[]> {
  const { data } = await db()
    .from("client_topics")
    .select("id, client_id, title, notes, created_by, created_at, clients(name)")
    .eq("source", "cliente")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = { id: string; client_id: string; title: string; notes: string | null; created_by: string | null; created_at: string; clients: { name: string } | { name: string }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: people } = await db().from("profiles").select("id, name, email").in("id", authorIds);
    for (const p of (people ?? []) as { id: string; name: string | null; email: string }[]) names.set(p.id, p.name?.trim() || p.email);
  }
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: one(r.clients)?.name ?? "Cliente",
    title: r.title,
    notes: r.notes,
    author: r.created_by ? (names.get(r.created_by) ?? null) : null,
    at: r.created_at,
  }));
}

export async function countSuggestedTopics(): Promise<number> {
  const { count } = await db().from("client_topics").select("id", { count: "exact", head: true }).eq("source", "cliente").eq("status", "pending");
  return count ?? 0;
}
