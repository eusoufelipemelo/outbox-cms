"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/data/sites";
import { CLIENT_STATUSES, UFS } from "@/components/clients/options";
import type { ActionResult } from "@/lib/types";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente.").max(120, "Use no máximo 120 caracteres."),
  legal_name: text(200),
  document: text(30),
  contact_name: text(120),
  email: text(200).refine((v) => v === null || z.email().safeParse(v).success, {
    error: "Informe um e-mail válido, como nome@empresa.com.br.",
  }),
  phone: text(40),
  segment: text(80),
  city: text(80),
  state: z.union([z.enum(UFS), z.literal("")], { error: "Escolha uma UF da lista." }).transform((v) => (v === "" ? null : v)),
  logo_url: text(500).refine((v) => v === null || isHttpUrl(v), {
    error: "Informe o endereço completo da imagem, começando com https://.",
  }),
  brand_color: text(7).refine((v) => v === null || /^#[0-9a-f]{6}$/i.test(v), {
    error: "Use o formato #RRGGBB, por exemplo #1F5FBF.",
  }),
  tone_of_voice: text(2000),
  audience: text(1000),
  keywords: z.array(z.string().max(60, "Cada palavra-chave pode ter no máximo 60 caracteres.")).max(40, "Use no máximo 40 palavras-chave."),
  notes: text(4000),
  status: z.enum(CLIENT_STATUSES, { error: "Escolha um status válido." }),
});

function readKeywords(formData: FormData): string[] {
  const raw = [...formData.getAll("keywords").map(String), ...String(formData.get("keywords_draft") ?? "").split(",")];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const k = item.trim().replace(/\s+/g, " ");
    const key = k.toLowerCase();
    if (!k || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Cria (sem `id`) ou atualiza (com `id`) um cliente. */
export async function saveClient(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return { ok: false, error: "Cliente inválido. Recarregue a página e tente de novo." };

  const str = (k: string) => String(formData.get(k) ?? "");
  const parsed = clientSchema.safeParse({
    name: str("name"),
    legal_name: str("legal_name"),
    document: str("document"),
    contact_name: str("contact_name"),
    email: str("email"),
    phone: str("phone"),
    segment: str("segment"),
    city: str("city"),
    state: str("state"),
    logo_url: str("logo_url"),
    brand_color: str("brand_color"),
    tone_of_voice: str("tone_of_voice"),
    audience: str("audience"),
    keywords: readKeywords(formData),
    notes: str("notes"),
    status: str("status") || "active",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = { ...parsed.data, brand_color: parsed.data.brand_color?.toLowerCase() ?? null };

  if (id) {
    const { data, error } = await db().from("clients").update(values).eq("id", id).select("id").maybeSingle();
    if (error) {
      console.error("saveClient/update", error);
      return { ok: false, error: "Não foi possível salvar o cliente. Tente de novo em instantes." };
    }
    if (!data) return { ok: false, error: "Este cliente não existe mais. Ele pode ter sido excluído." };
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return { ok: true, data: { id }, message: "Cliente salvo" };
  }

  const { data, error } = await db().from("clients").insert(values).select("id").single();
  if (error || !data) {
    console.error("saveClient/insert", error);
    return { ok: false, error: "Não foi possível cadastrar o cliente. Tente de novo em instantes." };
  }
  revalidatePath("/clientes");
  return { ok: true, data: { id: data.id as string }, message: "Cliente salvo" };
}

/** Exclui o cliente. O banco remove em cascata os sites e os registros de publicação. */
export async function deleteClient(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Cliente inválido. Recarregue a página e tente de novo." };

  const { error } = await db().from("clients").delete().eq("id", id);
  if (error) {
    console.error("deleteClient", error);
    return { ok: false, error: "Não foi possível excluir o cliente. Tente de novo em instantes." };
  }
  revalidatePath("/clientes");
  revalidatePath("/", "layout");
  return { ok: true, message: "Cliente excluído" };
}
