"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { normalizeDomain } from "@/lib/content";
import { normalizeUrl } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";
import { UFS } from "@/components/clients/options";

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120),
  domain: z
    .string()
    .trim()
    .min(1, "Informe o domínio do site.")
    .transform((v) => normalizeDomain(v))
    .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), "Use só o domínio, por exemplo: clinicaexemplo.com.br"),
  segment: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  state: z
    .string()
    .optional()
    .refine((v) => !v || (UFS as readonly string[]).includes(v), "UF inválida."),
});

/** Cadastro rápido: cria o cliente e o site dele de uma vez. Só nome e domínio são obrigatórios. */
export async function quickCreateClient(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    domain: formData.get("domain") ?? "",
    segment: formData.get("segment") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Confira os campos destacados.", fieldErrors };
  }
  const { name, domain, segment, city, state } = parsed.data;

  // Mesmo domínio já cadastrado?
  const { data: existing, error: listErr } = await db().from("sites").select("id, url, client_id");
  if (listErr) return { ok: false, error: "Não foi possível verificar o domínio. Tente de novo." };
  const dup = (existing ?? []).find((s) => normalizeDomain(s.url) === domain);
  if (dup) return { ok: false, error: "Esse domínio já está cadastrado.", fieldErrors: { domain: "Esse domínio já pertence a outro cliente." } };

  const { data: client, error: cErr } = await db()
    .from("clients")
    .insert({ name, segment: segment || null, city: city || null, state: state || null })
    .select("id")
    .single();
  if (cErr || !client) return { ok: false, error: "Não foi possível cadastrar o cliente. Tente de novo." };

  const { error: sErr } = await db()
    .from("sites")
    .insert({ client_id: client.id, name, url: normalizeUrl(`https://${domain}`), platform: "api" });
  if (sErr) {
    await db().from("clients").delete().eq("id", client.id);
    return { ok: false, error: "Não foi possível cadastrar o site. Tente de novo." };
  }

  revalidatePath("/clientes");
  revalidatePath("/");
  return { ok: true, data: { id: client.id }, message: "Cliente cadastrado" };
}
