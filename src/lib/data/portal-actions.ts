"use server";

import { revalidatePath } from "next/cache";
import { approveByClient, changesByClient } from "@/lib/approval/client-approval";
import { getPortalClient, getPortalPost } from "@/lib/data/portal";

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
