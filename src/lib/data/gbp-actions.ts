"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { generate } from "@/lib/ai/server";
import { disconnect } from "@/lib/google/oauth";
import { listAccounts, listLocations, listReviews, performance, replyReview, STARS, type GbpMetrics } from "@/lib/google/gbp";
import { publishArticleToGbp } from "@/lib/google/publish";
import type { ActionResult } from "@/lib/types";

const fail = (err: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : fallback });

const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/** Busca todos os perfis que a conta da OutBox gerencia e liga automaticamente pelo site. */
export async function syncLocations(): Promise<ActionResult<{ total: number; linked: number }>> {
  await requireAdmin();
  try {
    const accounts = await listAccounts();
    const { data: sites } = await db().from("sites").select("url, client_id");
    const byHost = new Map(((sites ?? []) as { url: string; client_id: string }[]).map((s) => [host(s.url), s.client_id]));
    const { data: existing } = await db().from("gbp_locations").select("location_name, client_id");
    const linkedBefore = new Map(((existing ?? []) as { location_name: string; client_id: string | null }[]).map((l) => [l.location_name, l.client_id]));

    let total = 0;
    let linked = 0;
    for (const acc of accounts) {
      for (const loc of await listLocations(acc.name)) {
        const a = loc.storefrontAddress;
        const clientId = linkedBefore.get(loc.name) ?? byHost.get(host(loc.websiteUri)) ?? null;
        if (clientId) linked++;
        await db()
          .from("gbp_locations")
          .upsert(
            {
              account_name: acc.name,
              location_name: loc.name,
              title: loc.title,
              address: a ? [...(a.addressLines ?? []), a.locality, a.administrativeArea].filter(Boolean).join(", ") : null,
              website: loc.websiteUri ?? null,
              maps_uri: loc.metadata?.mapsUri ?? null,
              client_id: clientId,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "location_name" },
          );
        total++;
      }
    }
    revalidatePath("/google-empresas");
    return { ok: true, data: { total, linked }, message: `${total} perfil(is) encontrados, ${linked} ligado(s) a clientes` };
  } catch (err) {
    return fail(err, "Não foi possível buscar os perfis no Google.");
  }
}

export async function linkLocation(locationId: string, clientId: string | null, unitId: string | null): Promise<ActionResult> {
  await requireUser();
  const { error } = await db().from("gbp_locations").update({ client_id: clientId, unit_id: unitId }).eq("id", locationId);
  if (error) return { ok: false, error: "Não foi possível ligar o perfil ao cliente." };
  revalidatePath("/google-empresas");
  return { ok: true, message: clientId ? "Perfil ligado ao cliente" : "Perfil desligado do cliente" };
}

async function location(locationId: string) {
  const { data } = await db().from("gbp_locations").select("account_name, location_name, title, client_id").eq("id", locationId).maybeSingle();
  if (!data) throw new Error("Perfil não encontrado. Sincronize os perfis de novo.");
  return data as { account_name: string; location_name: string; title: string; client_id: string | null };
}

export type ReviewItem = { name: string; author: string; stars: number; comment: string; date: string | null; reply: string | null };

export async function loadReviews(locationId: string): Promise<ActionResult<{ reviews: ReviewItem[]; average: number | null; total: number }>> {
  await requireUser();
  try {
    const loc = await location(locationId);
    const r = await listReviews(loc.account_name, loc.location_name);
    return {
      ok: true,
      data: {
        average: r.average ?? null,
        total: r.total ?? r.reviews.length,
        reviews: r.reviews.map((v) => ({
          name: v.name,
          author: v.reviewer?.displayName ?? "Cliente",
          stars: STARS[v.starRating ?? ""] ?? 0,
          comment: v.comment ?? "",
          date: v.createTime ?? null,
          reply: v.reviewReply?.comment ?? null,
        })),
      },
    };
  } catch (err) {
    return fail(err, "Não foi possível carregar as avaliações.");
  }
}

/** A IA sugere uma resposta no tom do cliente; nada é publicado sem aprovação. */
export async function suggestReply(locationId: string, review: { author: string; stars: number; comment: string }): Promise<ActionResult<{ text: string }>> {
  await requireUser();
  try {
    const loc = await location(locationId);
    const { data: client } = loc.client_id
      ? await db().from("clients").select("name, segment, tone_of_voice").eq("id", loc.client_id).maybeSingle()
      : { data: null };
    const c = client as { name: string; segment: string | null; tone_of_voice: string | null } | null;
    const out = await generate(
      z.object({ reply: z.string().describe("Resposta pública à avaliação, em português do Brasil, 2 a 4 frases.") }),
      {
        system: `Você responde avaliações do Google em nome de ${c?.name ?? loc.title}${c?.segment ? ` (${c.segment})` : ""}. ${c?.tone_of_voice ? `Tom de voz: ${c.tone_of_voice}.` : "Tom cordial e profissional."}
Regras: agradeça pelo nome, responda ao que a pessoa disse, sem promessas que a empresa não pode cumprir, sem dados pessoais, sem links. Em avaliação negativa: reconheça, peça desculpas sem se justificar demais e convide para resolver por contato direto. Não use emojis.`,
        user: `Avaliação de ${review.author}, ${review.stars} estrela(s):\n"${review.comment || "(sem texto)"}"\n\nEscreva a resposta.`,
      },
      { maxTokens: 800, timeoutMs: 60_000, effort: "low", task: "apoio" },
    );
    return { ok: true, data: { text: out.reply.trim() } };
  } catch (err) {
    return fail(err, "Não foi possível sugerir uma resposta.");
  }
}

export async function sendReply(reviewName: string, text: string): Promise<ActionResult> {
  await requireUser();
  const comment = text.trim();
  if (comment.length < 5) return { ok: false, error: "Escreva a resposta antes de publicar." };
  try {
    await replyReview(reviewName, comment.slice(0, 4000));
    return { ok: true, message: "Resposta publicada no Google" };
  } catch (err) {
    return fail(err, "Não foi possível publicar a resposta.");
  }
}

export async function loadPerformance(locationId: string): Promise<ActionResult<GbpMetrics>> {
  await requireUser();
  try {
    const loc = await location(locationId);
    return { ok: true, data: await performance(loc.location_name, 30) };
  } catch (err) {
    return fail(err, "Não foi possível carregar o desempenho.");
  }
}

export async function publishToGbp(postId: string): Promise<ActionResult> {
  await requireUser();
  const r = await publishArticleToGbp(postId);
  revalidatePath("/google-empresas");
  return r.sent ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function disconnectGoogle(): Promise<ActionResult> {
  await requireAdmin();
  await disconnect();
  revalidatePath("/google-empresas");
  return { ok: true, message: "Conta Google desconectada" };
}
