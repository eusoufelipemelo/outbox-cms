"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { getSite, isUuid } from "@/lib/data/sites";
import { testSiteConnection } from "@/lib/delivery";
import { SITE_PLATFORMS } from "@/components/clients/options";
import { normalizeUrl } from "@/lib/utils";
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
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** O WordPress recebe a senha de aplicativo em toda chamada: o endereço é sempre salvo com https://. */
function forceHttps(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

/** Texto opcional que, se preenchido, vira URL normalizada (https://, sem barra final). */
const optionalUrl = (message: string) =>
  text(500)
    .transform((v) => (v === null ? null : normalizeUrl(v)))
    .refine((v) => v === null || isHttpUrl(v), { error: message });

const siteSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao site, como Site institucional.").max(120, "Use no máximo 120 caracteres."),
  url: z
    .string()
    .trim()
    .min(1, "Informe o endereço do site.")
    .max(500, "Use no máximo 500 caracteres.")
    .transform((v) => normalizeUrl(v))
    .refine(isHttpUrl, { error: "Informe um endereço válido, como https://www.cliente.com.br." }),
  blog_path: z
    .string()
    .trim()
    .max(120, "Use no máximo 120 caracteres.")
    .transform((v) => {
      const clean = v.replace(/^\/+|\/+$/g, "");
      return clean ? `/${clean}` : "/blog";
    })
    .refine((v) => /^\/[a-z0-9\-_/.]*$/i.test(v), {
      error: "Use só letras, números, hífen e barras, como /blog ou /conteudo/artigos.",
    }),
  platform: z.enum(SITE_PLATFORMS, { error: "Escolha como o site recebe os artigos." }),
  webhook_url: optionalUrl("Informe uma URL válida para o webhook, começando com https://."),
  wp_url: optionalUrl("Informe o endereço do WordPress, como https://www.cliente.com.br."),
  wp_username: text(120),
  wp_app_password: z.string().trim().max(200, "Use no máximo 200 caracteres."),
  wp_default_status: z.enum(["publish", "draft"], { error: "Escolha publicar ou salvar como rascunho." }),
  default_author: text(120),
  default_category: text(120),
  status: z.enum(["active", "paused"], { error: "Escolha um status válido." }),
});

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function revalidateSite(clientId: string, siteId?: string) {
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  if (siteId) revalidatePath(`/clientes/${clientId}/sites/${siteId}`);
  revalidatePath("/integracoes");
}

/** Cria (sem `id`) ou atualiza (com `id`) um site. A senha do WordPress vazia mantém a salva. */
export async function saveSite(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  if ((id && !isUuid(id)) || !isUuid(clientId)) {
    return { ok: false, error: "Site inválido. Recarregue a página e tente de novo." };
  }

  const existing = id ? await getSite(id) : null;
  if (id && (!existing || existing.client_id !== clientId)) {
    return { ok: false, error: "Este site não existe mais. Ele pode ter sido excluído." };
  }

  const str = (k: string) => String(formData.get(k) ?? "");
  const parsed = siteSchema.safeParse({
    name: str("name"),
    url: str("url"),
    blog_path: str("blog_path"),
    platform: str("platform"),
    webhook_url: str("webhook_url"),
    wp_url: str("wp_url"),
    wp_username: str("wp_username"),
    wp_app_password: str("wp_app_password"),
    wp_default_status: str("wp_default_status") || "publish",
    default_author: str("default_author"),
    default_category: str("default_category"),
    status: str("status") || "active",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const v = parsed.data;

  const fieldErrors: Record<string, string> = {};
  if (v.platform === "webhook" && !v.webhook_url) {
    fieldErrors.webhook_url = "Informe a URL que o CMS deve chamar a cada publicação.";
  }
  if (v.platform === "wordpress") {
    if (!v.wp_username) fieldErrors.wp_username = "Informe o usuário do WordPress que vai publicar os posts.";
    if (!v.wp_app_password && !existing?.wp_app_password) {
      fieldErrors.wp_app_password = "Informe a senha de aplicativo gerada no WordPress.";
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }

  const values: Record<string, unknown> = {
    name: v.name,
    url: v.url,
    blog_path: v.blog_path,
    platform: v.platform,
    webhook_url: v.webhook_url,
    default_author: v.default_author,
    default_category: v.default_category,
    status: v.status,
  };
  // Campos do WordPress só mudam quando o WordPress é o canal escolhido,
  // para não perder as credenciais ao alternar de plataforma.
  if (v.platform === "wordpress") {
    values.wp_url = forceHttps(v.wp_url ?? v.url);
    values.wp_username = v.wp_username;
    values.wp_default_status = v.wp_default_status;
    if (v.wp_app_password) values.wp_app_password = v.wp_app_password;
  }

  if (existing) {
    const { error } = await db().from("sites").update(values).eq("id", existing.id);
    if (error) {
      console.error("saveSite/update", error);
      return { ok: false, error: "Não foi possível salvar o site. Tente de novo em instantes." };
    }
    revalidateSite(clientId, existing.id);
    return { ok: true, data: { id: existing.id }, message: "Site salvo" };
  }

  const { data, error } = await db()
    .from("sites")
    .insert({ ...values, client_id: clientId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("saveSite/insert", error);
    const missingClient = error?.code === "23503";
    return {
      ok: false,
      error: missingClient
        ? "Este cliente não existe mais. Volte para a lista de clientes."
        : "Não foi possível cadastrar o site. Tente de novo em instantes.",
    };
  }
  revalidateSite(clientId, data.id as string);
  return { ok: true, data: { id: data.id as string }, message: "Site salvo" };
}

/** Exclui o site. O banco remove em cascata as publicações e o histórico de entregas dele. */
export async function deleteSite(id: string): Promise<ActionResult> {
  await requireUser();
  const site = await getSite(id);
  if (!site) return { ok: false, error: "Este site não existe mais. Ele pode já ter sido excluído." };

  const { error } = await db().from("sites").delete().eq("id", site.id);
  if (error) {
    console.error("deleteSite", error);
    return { ok: false, error: "Não foi possível excluir o site. Tente de novo em instantes." };
  }
  revalidateSite(site.client_id);
  return { ok: true, message: "Site excluído" };
}

/** Troca a chave pública da Content API do site. A chave anterior para de funcionar na hora. */
export async function regenerateSiteKey(id: string): Promise<ActionResult<{ publicKey: string }>> {
  await requireUser();
  const site = await getSite(id);
  if (!site) return { ok: false, error: "Este site não existe mais. Recarregue a página." };

  const publicKey = `pk_${randomBytes(16).toString("hex")}`;
  const { error } = await db().from("sites").update({ public_key: publicKey }).eq("id", site.id);
  if (error) {
    console.error("regenerateSiteKey", error);
    return { ok: false, error: "Não foi possível gerar a nova chave. Tente de novo em instantes." };
  }
  revalidateSite(site.client_id, site.id);
  return { ok: true, data: { publicKey }, message: "Nova chave gerada" };
}

/** Testa a conexão com o site pelo motor de entrega e guarda o resultado. */
export async function runSiteConnectionTest(id: string): Promise<ActionResult<{ ok: boolean; message: string }>> {
  await requireUser();
  const site = await getSite(id);
  if (!site) return { ok: false, error: "Este site não existe mais. Recarregue a página." };

  let result: { ok: boolean; message: string };
  try {
    result = await testSiteConnection(site.id);
  } catch (err) {
    console.error("runSiteConnectionTest", err);
    const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
    return {
      ok: false,
      error: `Não foi possível testar a conexão agora${detail}. Confira os dados do site e tente de novo em instantes.`,
    };
  }

  // testSiteConnection já grava sites.last_check_* e a linha em deliveries.
  revalidateSite(site.client_id, site.id);
  return { ok: true, data: result };
}
