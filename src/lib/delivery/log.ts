import "server-only";
import { db } from "@/lib/supabase/admin";
import type { DeliveryChannel, DeliveryEvent } from "@/lib/types";

export type DeliveryLogEntry = {
  postSiteId?: string | null;
  postId?: string | null;
  siteId: string;
  channel: DeliveryChannel;
  event: DeliveryEvent;
  ok: boolean;
  statusCode?: number | null;
  message: string;
  durationMs: number;
};

/** Registra uma linha em `deliveries`. Nunca lança: falha de log não derruba a entrega. */
export async function logDelivery(entry: DeliveryLogEntry): Promise<void> {
  try {
    const { error } = await db()
      .from("deliveries")
      .insert({
        post_site_id: entry.postSiteId ?? null,
        post_id: entry.postId ?? null,
        site_id: entry.siteId,
        channel: entry.channel,
        event: entry.event,
        ok: entry.ok,
        status_code: entry.statusCode ?? null,
        message: entry.message.slice(0, 2000),
        duration_ms: Math.max(0, Math.round(entry.durationMs)),
      });
    if (error) console.error("[delivery] falha ao registrar entrega:", error.message);
  } catch (err) {
    console.error("[delivery] falha ao registrar entrega:", err);
  }
}
