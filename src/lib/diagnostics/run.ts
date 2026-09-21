import "server-only";
import { db } from "@/lib/supabase/admin";
import { findBusiness, type BusinessResult } from "./business";
import { runPageSpeed } from "./pagespeed";
import { writeReport } from "./report";
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

/** Executa o diagnóstico completo (1 a 2 minutos) e grava cada etapa na linha. */
export async function runDiagnostic(id: string): Promise<void> {
  const { data: row } = await db().from("diagnostics").select("url, business_name, city").eq("id", id).maybeSingle();
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

    const scores = computeScores(pagespeed, site, business);
    await update(id, { business, scores, step: "Escrevendo o relatório e o plano de 6 a 12 meses" });

    let report = null;
    let reportError: string | null = null;
    try {
      report = await writeReport({ url, scores, pagespeed, site, business });
    } catch (err) {
      reportError = err instanceof Error ? err.message : "Não foi possível escrever o relatório.";
    }
    await update(id, { report, status: "done", step: null, error: reportError, finished_at: new Date().toISOString() });
  } catch (err) {
    await update(id, {
      status: "failed",
      step: null,
      error: err instanceof Error ? err.message : "O diagnóstico parou por um erro inesperado. Tente de novo.",
      finished_at: new Date().toISOString(),
    });
  }
}
