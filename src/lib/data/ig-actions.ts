"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { draftFromArticle, publishIgPost } from "@/lib/instagram/compose";
import { rebuildWithPhotos } from "@/lib/instagram/rephoto";
import type { ActionResult } from "@/lib/types";

const done = () => revalidatePath("/instagram");

/** Gera carrossel + legenda + story de um artigo que já está no ar. */
export async function createIgDraft(postId: string): Promise<ActionResult> {
  await requireUser();
  const { data } = await db().from("post_sites").select("sites!inner(client_id)").eq("post_id", postId).eq("status", "published").limit(1).maybeSingle();
  const site = (data as { sites: { client_id: string } | { client_id: string }[] } | null)?.sites;
  const clientId = Array.isArray(site) ? site[0]?.client_id : site?.client_id;
  if (!clientId) return { ok: false, error: "Este artigo não está no ar em nenhum site." };
  try {
    const { data: c } = await db().from("clients").select("ig_formats").eq("id", clientId).maybeSingle();
    await draftFromArticle(postId, clientId, (c as { ig_formats?: string[] } | null)?.ig_formats ?? ["carousel", "story"]);
    done();
    return { ok: true, message: "Carrossel e story criados. Revise e publique." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível criar o post." };
  }
}

export async function publishIg(igPostId: string): Promise<ActionResult> {
  await requireUser();
  const r = await publishIgPost(igPostId);
  done();
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function updateIgCaption(igPostId: string, caption: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("ig_posts").update({ caption: caption.slice(0, 2200) }).eq("id", igPostId).neq("status", "published");
  if (error) return { ok: false, error: "Não foi possível salvar a legenda." };
  done();
  return { ok: true, message: "Legenda salva" };
}

export async function deleteIgPost(igPostId: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("ig_posts").delete().eq("id", igPostId).neq("status", "published");
  if (error) return { ok: false, error: "Não foi possível excluir." };
  done();
  return { ok: true, message: "Rascunho excluído" };
}

export async function disconnectIg(clientId: string): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("ig_accounts").delete().eq("client_id", clientId);
  if (error) return { ok: false, error: "Não foi possível desconectar." };
  done();
  return { ok: true, message: "Instagram desconectado" };
}

/** Refaz as fotos do post (e do par carrossel/story) mantendo o texto; leva alguns minutos. */
export async function rephotoIgPost(igPostId: string): Promise<ActionResult> {
  await requireUser();
  const { data } = await db().from("ig_posts").select("status").eq("id", igPostId).maybeSingle();
  if (!data) return { ok: false, error: "Post não encontrado." };
  if ((data as { status: string }).status === "published") return { ok: false, error: "Este post já foi publicado." };
  await db().from("ig_posts").update({ status: "draft", error: "Refazendo as fotos…" }).eq("id", igPostId);
  after(async () => {
    try {
      await rebuildWithPhotos(igPostId);
    } catch (err) {
      await db().from("ig_posts").update({ error: err instanceof Error ? err.message.slice(0, 500) : "Não foi possível refazer as fotos." }).eq("id", igPostId);
    }
  });
  done();
  return { ok: true, message: "Refazendo as fotos. Em alguns minutos o post atualiza e vai para aprovação." };
}
