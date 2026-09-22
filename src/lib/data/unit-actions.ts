"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { UFS } from "@/components/clients/options";
import type { ActionResult, ClientUnit } from "@/lib/types";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const unitSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(2, "Dê um nome para a unidade, como Filial Brasília.").max(80),
  address: opt(200),
  city: z.string().trim().min(2, "Informe a cidade da unidade.").max(80),
  state: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase() || null)
    .nullable()
    .refine((v) => v === null || (UFS as readonly string[]).includes(v), "Escolha uma UF da lista."),
  phone: opt(40),
  manager: opt(120),
  maps_name: opt(160),
});

/** Grava a lista completa de unidades do cliente (a matriz continua no endereço principal). */
export async function saveUnits(clientId: string, units: ClientUnit[]): Promise<ActionResult> {
  await requireUser();
  const parsed = z.array(unitSchema).max(50, "Use no máximo 50 unidades.").safeParse(units);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira as unidades." };
  const { error } = await db().from("clients").update({ units: parsed.data }).eq("id", clientId);
  if (error) return { ok: false, error: "Não foi possível salvar as unidades. Tente de novo." };
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/mapa");
  return { ok: true, message: "Unidades salvas" };
}
