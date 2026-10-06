"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { listAdminOrgs } from "@/lib/linkedin/api";
import { liDisconnect } from "@/lib/linkedin/oauth";
import { publishArticleToLinkedIn } from "@/lib/linkedin/publish";
import { asciiDomain } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const refresh = () => {
  revalidatePath("/linkedin");
  revalidatePath("/servicos");
};

/** Busca as páginas que a conta administra e liga automaticamente pelo site do cliente. */
export async function syncLiPages(): Promise<ActionResult<{ total: number; linked: number }>> {
  await requireAdmin();
  try {
    const orgs = await listAdminOrgs();
    const { data: sites } = await db().from("sites").select("url, client_id");
    const byHost = new Map(((sites ?? []) as { url: string; client_id: string }[]).map((s) => [asciiDomain(s.url), s.client_id]));
    const { data: existing } = await db().from("li_pages").select("org_urn, client_id");
    const before = new Map(((existing ?? []) as { org_urn: string; client_id: string | null }[]).map((p) => [p.org_urn, p.client_id]));

    let linked = 0;
    for (const org of orgs) {
      const clientId = before.get(org.urn) ?? (org.website ? byHost.get(asciiDomain(org.website)) : undefined) ?? null;
      if (clientId) linked++;
      await db()
        .from("li_pages")
        .upsert(
          { org_urn: org.urn, name: org.name, vanity_name: org.vanityName, website: org.website, client_id: clientId, synced_at: new Date().toISOString() },
          { onConflict: "org_urn" },
        );
    }
    refresh();
    return { ok: true, data: { total: orgs.length, linked }, message: `${orgs.length} página(s) encontrada(s), ${linked} ligada(s) a clientes` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível buscar as páginas na LinkedIn." };
  }
}

export async function linkLiPage(pageId: string, clientId: string | null): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("li_pages").update({ client_id: clientId }).eq("id", pageId);
  if (error) return { ok: false, error: "Não foi possível ligar a página ao cliente." };
  refresh();
  return { ok: true, message: clientId ? "Página ligada ao cliente" : "Página desligada do cliente" };
}

export async function publishToLinkedIn(pageId: string, postId: string): Promise<ActionResult> {
  await requireUser();
  if (!postId) return { ok: false, error: "Escolha um artigo no ar." };
  const r = await publishArticleToLinkedIn(postId, { pageIds: [pageId] });
  refresh();
  return r.sent ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function disconnectLinkedIn(): Promise<ActionResult> {
  await requireAdmin();
  await liDisconnect();
  refresh();
  return { ok: true, message: "Conta da LinkedIn desconectada" };
}
