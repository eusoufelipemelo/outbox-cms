import "server-only";
import { db } from "@/lib/supabase/admin";
import type { BusinessResult } from "@/lib/diagnostics/business";
import type { PageSpeedResult } from "@/lib/diagnostics/pagespeed";
import type { Report } from "@/lib/diagnostics/report";
import type { Scores } from "@/lib/diagnostics/scoring";
import type { SiteChecks } from "@/lib/diagnostics/site-checks";

export type Diagnostic = {
  id: string;
  url: string;
  business_name: string | null;
  city: string | null;
  client_id: string | null;
  status: "running" | "done" | "failed";
  step: string | null;
  error: string | null;
  scores: Scores | null;
  pagespeed: { mobile: PageSpeedResult; desktop: PageSpeedResult } | null;
  site_checks: SiteChecks | null;
  business: BusinessResult | null;
  report: Report | null;
  ai: boolean;
  report_source: "ai" | "template" | null;
  share_token: string;
  created_at: string;
  finished_at: string | null;
};

export type DiagnosticListItem = Pick<Diagnostic, "id" | "url" | "business_name" | "status" | "scores" | "created_at">;

/** Diagnóstico parado há mais de 6 minutos (servidor reiniciado no meio) conta como falho. */
function settle<T extends { status: string; created_at: string; error?: string | null }>(d: T): T {
  if (d.status === "running" && Date.now() - Date.parse(d.created_at) > 6 * 60_000) {
    return { ...d, status: "failed", error: d.error ?? "O diagnóstico foi interrompido. Clique em Refazer." };
  }
  return d;
}

export async function listDiagnostics(): Promise<DiagnosticListItem[]> {
  const { data, error } = await db()
    .from("diagnostics")
    .select("id, url, business_name, status, scores, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Não foi possível carregar os diagnósticos: ${error.message}`);
  return ((data ?? []) as DiagnosticListItem[]).map(settle);
}

export async function getDiagnostic(id: string): Promise<Diagnostic | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from("diagnostics").select("*").eq("id", id).maybeSingle();
  return data ? settle(data as Diagnostic) : null;
}

export async function getDiagnosticByToken(token: string): Promise<Diagnostic | null> {
  if (!/^[0-9a-f]{24}$/i.test(token)) return null;
  const { data } = await db().from("diagnostics").select("*").eq("share_token", token).eq("status", "done").maybeSingle();
  return (data as Diagnostic | null) ?? null;
}
