import "server-only";
import { db } from "@/lib/supabase/admin";
import { aiStatus, aiProvider } from "@/lib/ai/server";
import { imagesEnabled } from "@/lib/ai/image";
import { telegramEnabled, connectLink, botUsername, getWebhookInfo } from "@/lib/automation/telegram";
import { visualSummary, type VisualClient } from "@/lib/ai/visual";
import type { ContentType } from "@/lib/types";

export type Automation = {
  id: string;
  client_id: string;
  active: boolean;
  per_month: number;
  weekdays: number[];
  hour: number;
  words: number;
  content_type: ContentType | null;
  cover: boolean;
  cover_model: string;
  site_ids: string[];
  approval: "telegram" | "auto" | "manual";
  author_name: string | null;
  telegram_chat_id: string | null;
  telegram_link_code: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
};

export type AutomationClient = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  expertName: string | null;
  contractEnd: string | null;
  /** Resumo da identidade visual usada nas capas ("escuro, cor #F15532, estilo próprio"). */
  visual: string | null;
  sites: { id: string; name: string; status: string }[];
  automation: Automation | null;
  connectUrl: string | null;
};

export type RunItem = {
  id: string;
  client_id: string | null;
  clientName: string;
  post_id: string | null;
  postTitle: string | null;
  status: "running" | "awaiting" | "approved" | "published" | "changes" | "failed" | "manual";
  step: string | null;
  error: string | null;
  feedback: string | null;
  approval_token: string;
  created_at: string;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** Clientes ativos com a automação de cada um (se houver). */
export async function listAutomationClients(): Promise<AutomationClient[]> {
  const [{ data: clients }, { data: autos }, bot] = await Promise.all([
    db().from("clients").select("id, name, segment, city, status, expert_name, contract_end, brand_color, image_style, image_mood, sites(id, name, status)").neq("status", "archived"),
    db().from("automations").select("*"),
    botUsername(),
  ]);
  const byClient = new Map(((autos ?? []) as Automation[]).map((a) => [a.client_id, a]));
  type Row = AutomationClient & { status: string; expert_name: string | null; contract_end: string | null } & VisualClient;
  return ((clients ?? []) as unknown as Row[])
    .map((c) => {
      const automation = byClient.get(c.id) ?? null;
      return {
        id: c.id,
        name: c.name,
        segment: c.segment,
        city: c.city,
        expertName: c.expert_name,
        contractEnd: c.contract_end,
        visual: visualSummary(c),
        sites: [...(c.sites ?? [])].sort((a, b) => collator.compare(a.name, b.name)),
        automation,
        connectUrl: automation ? connectLink(automation.telegram_link_code, bot) : null,
      };
    })
    .sort((a, b) => Number(Boolean(b.automation?.active)) - Number(Boolean(a.automation?.active)) || collator.compare(a.name, b.name));
}

export async function listRuns(limit = 30): Promise<RunItem[]> {
  const { data, error } = await db()
    .from("automation_runs")
    .select("id, client_id, post_id, status, step, error, feedback, approval_token, created_at, clients(name), posts(title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`);
  type Row = RunItem & { clients: { name: string } | { name: string }[] | null; posts: { title: string } | { title: string }[] | null };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    clientName: one(r.clients)?.name ?? "Cliente removido",
    postTitle: one(r.posts)?.title ?? null,
  }));
}

/** O que já está configurado no servidor para a automação funcionar. */
export async function automationStatus() {
  const telegram = telegramEnabled();
  let webhook: { connected: boolean; bot: string | null; error?: string } = { connected: false, bot: null };
  if (telegram) {
    const [bot, info] = await Promise.all([botUsername(), getWebhookInfo().catch(() => null)]);
    webhook = {
      bot,
      connected: Boolean(info?.url),
      ...(info?.last_error_message ? { error: info.last_error_message } : {}),
    };
  }
  const ai = aiStatus();
  return { ai: ai.enabled, aiModel: ai.model ?? null, aiProvider: aiProvider(), images: imagesEnabled(), telegram, webhook };
}

export async function getRunByToken(token: string) {
  if (!/^[0-9a-f]{24}$/i.test(token)) return null;
  const { data } = await db()
    .from("automation_runs")
    .select("id, status, feedback, post_id, clients(name)")
    .eq("approval_token", token)
    .maybeSingle();
  if (!data?.post_id) return null;
  const { data: post } = await db()
    .from("posts")
    .select("title, excerpt, content_html, cover_image_url, cover_image_alt, answer_summary, key_takeaways, faq, reading_minutes, author_name, created_at")
    .eq("id", data.post_id)
    .maybeSingle();
  if (!post) return null;
  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  return { run: data, post, clientName: (client as { name: string } | null)?.name ?? null };
}
