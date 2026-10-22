import "server-only";
import { db } from "@/lib/supabase/admin";
import type { ChecklistState } from "@/lib/gbp-checklist";

export type ChecklistClient = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  items: ChecklistState;
  startedAt: string | null;
  completedAt: string | null;
  mapsUri: string | null;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export async function listChecklistClients(): Promise<ChecklistClient[]> {
  const [clients, lists, locs] = await Promise.all([
    db().from("clients").select("id, name, segment, city, state").neq("status", "archived"),
    db().from("gbp_checklists").select("client_id, items, started_at, completed_at"),
    db().from("gbp_locations").select("client_id, maps_uri"),
  ]);
  const byClient = new Map(
    ((lists.data ?? []) as { client_id: string; items: ChecklistState | null; started_at: string; completed_at: string | null }[]).map((l) => [l.client_id, l]),
  );
  const maps = new Map<string, string>();
  for (const l of (locs.data ?? []) as { client_id: string | null; maps_uri: string | null }[]) if (l.client_id && l.maps_uri) maps.set(l.client_id, l.maps_uri);

  return ((clients.data ?? []) as { id: string; name: string; segment: string | null; city: string | null; state: string | null }[])
    .map((c) => {
      const l = byClient.get(c.id);
      return { ...c, items: l?.items ?? {}, startedAt: l?.started_at ?? null, completedAt: l?.completed_at ?? null, mapsUri: maps.get(c.id) ?? null };
    })
    .sort((a, b) => collator.compare(a.name, b.name));
}
