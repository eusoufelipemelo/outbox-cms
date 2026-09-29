import "server-only";
import { db } from "@/lib/supabase/admin";
import { botUsername, connectLink } from "@/lib/automation/telegram";
import { igConnectLink } from "@/lib/instagram/link";

export type IgFormat = "carousel" | "story";

export type ServiceClient = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  blogGbp: boolean;
  instagram: boolean;
  formats: IgFormat[];
  site: boolean;
  gbpProfiles: number;
  igUser: string | null;
  igConnected: boolean;
  igLink: string;
  telegram: boolean;
  telegramLink: string | null;
  blogAutomation: { active: boolean } | null;
  igAutomation: {
    active: boolean;
    per_month: number;
    weekdays: number[];
    hour: number;
    approval: "telegram" | "auto" | "manual";
    focus: string | null;
    next_run_at: string | null;
    last_error: string | null;
  } | null;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export async function listServiceClients(): Promise<ServiceClient[]> {
  const [clients, sites, gbp, ig, autos, igAutos, bot] = await Promise.all([
    db().from("clients").select("id, name, segment, city, state, svc_blog_gbp, svc_instagram, ig_formats, telegram_chat_id, telegram_link_code").neq("status", "archived"),
    db().from("sites").select("client_id, status"),
    db().from("gbp_locations").select("client_id"),
    db().from("ig_accounts").select("client_id, username"),
    db().from("automations").select("client_id, active"),
    db().from("ig_automations").select("client_id, active, per_month, weekdays, hour, approval, focus, next_run_at, last_error"),
    botUsername(),
  ]);
  const activeSites = new Set(((sites.data ?? []) as { client_id: string; status: string }[]).filter((s) => s.status === "active").map((s) => s.client_id));
  const gbpCount = new Map<string, number>();
  for (const l of (gbp.data ?? []) as { client_id: string | null }[]) if (l.client_id) gbpCount.set(l.client_id, (gbpCount.get(l.client_id) ?? 0) + 1);
  const igUsers = new Map(((ig.data ?? []) as { client_id: string; username: string | null }[]).map((a) => [a.client_id, a.username]));
  const blogAutos = new Map(((autos.data ?? []) as { client_id: string; active: boolean }[]).map((a) => [a.client_id, a]));
  const igAutoMap = new Map(((igAutos.data ?? []) as (ServiceClient["igAutomation"] & { client_id: string })[]).map((a) => [a!.client_id, a]));

  type Row = { id: string; name: string; segment: string | null; city: string | null; state: string | null; svc_blog_gbp: boolean; svc_instagram: boolean; ig_formats: string[] | null; telegram_chat_id: string | null; telegram_link_code: string | null };
  return ((clients.data ?? []) as Row[])
    .map((c) => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      state: c.state,
      blogGbp: c.svc_blog_gbp,
      instagram: c.svc_instagram,
      formats: (c.ig_formats ?? ["carousel", "story"]).filter((f): f is IgFormat => f === "carousel" || f === "story"),
      site: activeSites.has(c.id),
      gbpProfiles: gbpCount.get(c.id) ?? 0,
      igUser: igUsers.get(c.id) ?? null,
      igConnected: igUsers.has(c.id),
      igLink: igConnectLink(c.id),
      telegram: Boolean(c.telegram_chat_id),
      telegramLink: c.telegram_link_code ? connectLink(c.telegram_link_code, bot) : null,
      blogAutomation: blogAutos.get(c.id) ?? null,
      igAutomation: igAutoMap.get(c.id) ?? null,
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}
