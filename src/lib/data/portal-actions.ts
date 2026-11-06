"use server";

import { revalidatePath } from "next/cache";
import { approveByClient, changesByClient } from "@/lib/approval/client-approval";
import { getPortalClient, getPortalPost } from "@/lib/data/portal";
import { db } from "@/lib/supabase/admin";

type Result = { ok: boolean; message: string };

async function guard(token: string, postId: string): Promise<{ clientId: string } | null> {
  const client = await getPortalClient(token);
  if (!client) return null;
  const post = await getPortalPost(client.id, postId);
  return post ? { clientId: client.id } : null;
}

/** Botão "Aprovar e publicar" da área do cliente. */
export async function approveFromPortal(token: string, postId: string): Promise<Result> {
  if (!(await guard(token, postId))) return { ok: false, message: "Link inválido ou expirado. Peça um novo para a equipe da OutBox." };
  const r = await approveByClient(postId);
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/portal/${token}/${postId}`);
  revalidatePath("/");
  return r;
}

/** Botão "Pedir ajustes" da área do cliente. */
export async function changesFromPortal(token: string, postId: string, text: string): Promise<Result> {
  if (!(await guard(token, postId))) return { ok: false, message: "Link inválido ou expirado. Peça um novo para a equipe da OutBox." };
  const r = await changesByClient(postId, text);
  revalidatePath(`/portal/${token}`);
  revalidatePath(`/portal/${token}/${postId}`);
  revalidatePath("/");
  return r;
}

/** O cliente sugere um tema: entra na fila da automação dele. */
export async function suggestTopicFromPortal(token: string, title: string, notes: string): Promise<Result> {
  const client = await getPortalClient(token);
  if (!client) return { ok: false, message: "Link inválido ou expirado. Peça um novo para a equipe da OutBox." };
  const t = title.trim();
  if (t.length < 5) return { ok: false, message: "Escreva o tema do artigo." };
  const { error } = await db()
    .from("client_topics")
    .insert({ client_id: client.id, title: t.slice(0, 200), notes: notes.trim().slice(0, 1000) || null, source: "cliente" });
  if (error) return { ok: false, message: "Não foi possível enviar o tema. Tente de novo." };
  revalidatePath(`/portal/${token}`);
  revalidatePath("/automacao");
  return { ok: true, message: "Tema enviado. A OutBox escreve o artigo e ele aparece aqui para você aprovar." };
}
