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

/** Campo de data (aaaa-mm-dd) opcional. */
const date = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), { error: message });

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
  // Presença para Google e IAs (entidade do cliente)
  about: text(600),
  services: z.array(z.string().max(80, "Cada serviço pode ter no máximo 80 caracteres.")).max(30, "Use no máximo 30 serviços."),
  service_area: text(200),
  address: text(300),
  opening_hours: text(300),
  social_links: z
    .array(z.string().max(300, "Cada link pode ter no máximo 300 caracteres."))
    .max(12, "Use no máximo 12 links.")
    .refine((links) => links.every(isHttpUrl), {
      error: "Confira os links: cada linha precisa ser um endereço completo, como https://instagram.com/cliente.",
    }),
  expert_name: text(120),
  expert_credentials: text(200),
  expert_bio: text(1500),
  status: z.enum(CLIENT_STATUSES, { error: "Escolha um status válido." }),
  contract_start: date("Confira a data de início do contrato."),
  contract_end: date("Confira a data de término do contrato."),
});

/** Etiquetas de um campo de tags: cada valor de `name` mais o texto ainda não confirmado em `${name}_draft`. */
function readTags(formData: FormData, name: string): string[] {
  const raw = [...formData.getAll(name).map(String), ...String(formData.get(`${name}_draft`) ?? "").split(",")];
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

/** Links, um por linha. Completa "https://" quando a pessoa cola só o domínio (ex.: instagram.com/cliente). */
function readLinks(formData: FormData, name: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of String(formData.get(name) ?? "").split(/[\r\n]+/)) {
    let link = line.trim();
    if (!link) continue;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(link)) link = `https://${link}`;
    const key = link.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
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
    keywords: readTags(formData, "keywords"),
    notes: str("notes"),
    about: str("about"),
    services: readTags(formData, "services"),
    service_area: str("service_area"),
    address: str("address"),
    opening_hours: str("opening_hours"),
    social_links: readLinks(formData, "social_links"),
    expert_name: str("expert_name"),
    expert_credentials: str("expert_credentials"),
    expert_bio: str("expert_bio"),
    status: str("status") || "active",
    contract_start: str("contract_start"),
    contract_end: str("contract_end"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = { ...parsed.data, brand_color: parsed.data.brand_color?.toLowerCase() ?? null };
  if (values.contract_start && values.contract_end && values.contract_end < values.contract_start) {
    return { ok: false, error: "Revise as datas do contrato.", fieldErrors: { contract_end: "O término não pode ser antes do início." } };
  }

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
