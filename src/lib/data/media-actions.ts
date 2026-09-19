"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { deleteImage } from "@/lib/storage";
import type { ActionResult } from "@/lib/types";
import { MEDIA_ALT_MAX } from "@/components/media/constants";

const idSchema = z.uuid();

export async function updateMediaAlt(id: string, alt: string): Promise<ActionResult<{ alt: string | null }>> {
  await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Imagem não encontrada. Recarregue a página." };
  const value = typeof alt === "string" ? alt.replace(/\s+/g, " ").trim() : "";
  if (value.length > MEDIA_ALT_MAX) {
    return { ok: false, error: `O texto alternativo passou de ${MEDIA_ALT_MAX} caracteres. Resuma a descrição.` };
  }
  const { data, error } = await db()
    .from("media")
    .update({ alt: value || null })
    .eq("id", parsedId.data)
    .select("alt")
    .maybeSingle();
  if (error) return { ok: false, error: "Não foi possível salvar o texto alternativo. Tente de novo." };
  if (!data) return { ok: false, error: "Imagem não encontrada. Ela pode ter sido excluída." };
  revalidatePath("/midia");
  return { ok: true, data: { alt: (data as { alt: string | null }).alt }, message: "Texto alternativo salvo" };
}

export async function deleteMedia(id: string): Promise<ActionResult> {
  await requireUser();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Imagem não encontrada. Recarregue a página." };
  const supabase = db();
  const { data: row, error: readError } = await supabase.from("media").select("id, path").eq("id", parsedId.data).maybeSingle();
  if (readError) return { ok: false, error: "Não foi possível excluir a imagem. Tente de novo." };
  if (!row) return { ok: true, message: "Imagem excluída" };

  try {
    await deleteImage((row as { path: string }).path);
  } catch {
    return { ok: false, error: "O arquivo não pôde ser removido do armazenamento. Tente de novo em instantes." };
  }
  const { error } = await supabase.from("media").delete().eq("id", parsedId.data);
  if (error) return { ok: false, error: "O arquivo foi removido, mas o registro não. Recarregue a página e tente de novo." };
  revalidatePath("/midia");
  return { ok: true, message: "Imagem excluída" };
}
