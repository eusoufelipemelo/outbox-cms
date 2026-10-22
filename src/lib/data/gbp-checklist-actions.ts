"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { ALL_KEYS, progress, type ChecklistState } from "@/lib/gbp-checklist";
import type { ActionResult } from "@/lib/types";

async function load(clientId: string): Promise<ChecklistState> {
  const { data } = await db().from("gbp_checklists").select("items").eq("client_id", clientId).maybeSingle();
  return ((data as { items: ChecklistState } | null)?.items ?? {}) as ChecklistState;
}

async function save(clientId: string, items: ChecklistState, userId: string): Promise<ActionResult<{ completedAt: string | null }>> {
  const p = progress(items);
  const { data: prev } = await db().from("gbp_checklists").select("completed_at").eq("client_id", clientId).maybeSingle();
  const before = (prev as { completed_at: string | null } | null)?.completed_at ?? null;
  const completedAt = p.done === p.total ? (before ?? new Date().toISOString()) : null;
  const { error } = await db()
    .from("gbp_checklists")
    .upsert({ client_id: clientId, items, completed_at: completedAt, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "client_id" });
  if (error) return { ok: false, error: "Não foi possível salvar o checklist." };
  revalidatePath("/google-empresas/otimizacao");
  return { ok: true, data: { completedAt } };
}

/** Marca ou desmarca um item do checklist do cliente. */
export async function setChecklistItem(clientId: string, key: string, done: boolean): Promise<ActionResult<{ completedAt: string | null }>> {
  const user = await requireUser();
  if (!ALL_KEYS.includes(key)) return { ok: false, error: "Item desconhecido." };
  const items = await load(clientId);
  items[key] = { ...items[key], done, at: done ? new Date().toISOString() : undefined };
  return save(clientId, items, user.id);
}

/** Guarda a anotação de um item (categoria escolhida, link de avaliação, concorrentes…). */
export async function setChecklistNote(clientId: string, key: string, note: string): Promise<ActionResult<{ completedAt: string | null }>> {
  const user = await requireUser();
  if (!ALL_KEYS.includes(key)) return { ok: false, error: "Item desconhecido." };
  const items = await load(clientId);
  const text = note.trim().slice(0, 2000);
  items[key] = { ...items[key], note: text || undefined };
  return save(clientId, items, user.id);
}
