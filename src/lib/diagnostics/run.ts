import "server-only";
import { db } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { findBusiness, type BusinessResult, type UnitProfile } from "./business";
import { parseUnits } from "@/lib/units";
import { runPageSpeed } from "./pagespeed";
import { writeReport } from "./report";
import { templateReport } from "./template-report";
import { computeScores } from "./scoring";
import { checkSite } from "./site-checks";

async function update(id: string, patch: Record<string, unknown>) {
  await db().from("diagnostics").update(patch).eq("id", id);
}

/** Nome provável da empresa a partir do título da página ("Magare | Arquitetura" → "Magare"). */
function nameFromTitle(title?: string | null): string | null {
  const first = title?.split(/\s[|–—-]\s|\s·\s/)[0]?.trim();
  return first && first.length >= 3 && first.length <= 60 ? first : null;
}

/** Unidades do cliente dono do site analisado (pelo domínio), se ele estiver cadastrado. */
async function unitsForUrl(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const { data: sites } = await db().from("sites").select("url, client:clients(name, units)");
  for (const s of (sites ?? []) as unknown as { url: string; client: { name: string; units: unknown } | { name: string; units: unknown }[] | null }[]) {
    try {
      if (new URL(s.url).hostname.replace(/^www\./, "") !== host) continue;
    } catch {
      continue;
    }
    const client = Array.isArray(s.client) ? s.client[0] : s.client;
    if (client) return { name: client.name, units: parseUnits(client.units) };
  }
  return null;
}

/** Executa o diagnóstico completo (1 a 2 minutos) e grava cada etapa na linha. */
export async function runDiagnostic(id: string): Promise<void> {
  await loadSettings();
  const { data: row } = await db().from("diagnostics").select("url, business_name, city, ai").eq("id", id).maybeSingle();
  if (!row) return;
  const url = row.url as string;

  try {
    await update(id, { step: "Medindo a velocidade no Google PageSpeed e lendo o site", status: "running", error: null });
    const [mobile, desktop, site] = await Promise.all([runPageSpeed(url, "mobile"), runPageSpeed(url, "desktop"), checkSite(url)]);
    const pagespeed = { mobile, desktop };
    await update(id, { pagespeed, site_checks: site, step: "Procurando a empresa no Google Empresas" });

    let business: BusinessResult;
    if (row.business_name) {
      business = await findBusiness({ url, name: row.business_name, city: row.city });
    } else {
      const guess = nameFromTitle(site.title);
      business = guess ? await findBusiness({ url, name: guess, city: row.city, strict: true }) : { found: false, checks: [] };
      if (!business.found && !business.error) business = await findBusiness({ url, city: row.city, strict: true });
    }

    // filiais: um perfil do Google Empresas por unidade
    const owner = await unitsForUrl(url).catch(() => null);
    if (owner?.units.length && !business.error) {
      const units: UnitProfile[] = [];
      for (const u of owner.units.slice(0, 10)) {
        const r = await findBusiness({ url, name: u.maps_name ?? owner.name, city: u.city });
        units.push(
          r.found
            ? { label: u.label, city: u.city, found: true, name: r.name, rating: r.rating ?? null, reviews: r.reviews ?? 0, mapsUrl: r.mapsUrl }
            : { label: u.label, city: u.city, found: false },
        );
      }
      business = { ...business, units };
    }

    const scores = computeScores(pagespeed, site, business);
    await update(id, { business, scores, step: "Escrevendo o relatório e o plano de 6 a 12 meses" });

    // IA (pago) quando escolhida; se falhar ou estiver desligada, cai no relatório padrão (gratuito).
    const data = { url, scores, pagespeed, site, business };
    let report = null;
    let source: "ai" | "template" = "template";
    let reportError: string | null = null;
    if (row.ai) {
      try {
        report = await writeReport(data);
        if (report) source = "ai";
        else reportError = "A IA está desligada (sem ANTHROPIC_API_KEY). Usamos o relatório padrão.";
      } catch (err) {
        reportError = `A IA não respondeu (${err instanceof Error ? err.message : "erro desconhecido"}). Usamos o relatório padrão.`;
      }
    }
    report ??= templateReport(data);
    await update(id, { report, report_source: source, status: "done", step: null, error: reportError, finished_at: new Date().toISOString() });
  } catch (err) {
    await update(id, {
      status: "failed",
      step: null,
      error: err instanceof Error ? err.message : "O diagnóstico parou por um erro inesperado. Tente de novo.",
      finished_at: new Date().toISOString(),
    });
  }
}
