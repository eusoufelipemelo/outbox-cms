import "server-only";
import { z } from "zod";
import { aiEnabled, generate } from "@/lib/ai/server";
import type { BusinessResult } from "./business";
import type { PageSpeedResult } from "./pagespeed";
import type { Scores } from "./scoring";
import type { SiteChecks } from "./site-checks";

export const reportSchema = z.object({
  summary: z.string().describe("3 a 4 frases em linguagem de dono de empresa: onde está hoje e o que está deixando de ganhar."),
  problems: z
    .array(
      z.object({
        area: z.enum(["Velocidade", "SEO técnico", "Preparo para IAs", "Google Empresas", "Conversão"]),
        severity: z.enum(["alta", "media", "baixa"]),
        title: z.string().describe("O problema em até 10 palavras, sem jargão."),
        impact: z.string().describe("O que isso custa ao negócio, em 1 a 2 frases."),
        fix: z.string().describe("Como a OutBox corrige, em 1 a 2 frases."),
      }),
    )
    .describe("De 5 a 8 problemas, do mais grave ao menos grave."),
  plan: z
    .array(
      z.object({
        period: z.string().describe('Ex.: "Meses 1 e 2".'),
        focus: z.string().describe("Tema da fase em até 6 palavras."),
        actions: z.array(z.string()).describe("3 a 5 ações concretas."),
        result: z.string().describe("Resultado esperado ao fim da fase, sem prometer números exatos."),
      }),
    )
    .describe("Exatamente 4 fases: meses 1-2, 3-4, 5-6 (prazo mínimo) e 7-12 (prazo ideal)."),
  nextSteps: z.array(z.string()).describe("3 próximos passos imediatos para começar."),
});

export type Report = z.infer<typeof reportSchema>;

const SYSTEM = `Você é consultor sênior da OutBox, agência digital brasileira especialista em SEO, GEO (aparecer em respostas de IAs) e Google Empresas.
Recebe dados medidos de um site e do perfil da empresa no Google e escreve um diagnóstico para o consultor apresentar ao dono da empresa.
Regras:
- Português do Brasil, linguagem simples, direta e respeitosa. Explique siglas na primeira vez (ex.: LCP = tempo até o conteúdo principal aparecer).
- Use apenas os dados recebidos. Não invente números, concorrentes nem fatos. Se um dado não existe, não o cite.
- Não prometa posições no Google, faturamento ou números exatos de visitas. Fale em tendência e direção.
- Priorize o que mais afeta clientes chegando: Google Empresas e velocidade no celular costumam vir primeiro para negócios locais.
- O plano tem prazo mínimo de 6 meses (fases 1 a 3) e prazo ideal de 12 meses (fase 4, consolidação e crescimento). SEO leva tempo: deixe isso claro sem soar como desculpa.
- Soluções citam o trabalho da OutBox: otimização técnica, artigos de blog com SEO+GEO publicados pelo CMS, dados estruturados, llms.txt, gestão do Google Empresas (publicações, fotos, respostas a avaliações, pedido de avaliações).`;

function compact(ps: PageSpeedResult) {
  return ps.ok
    ? { notas: ps.scores, metricas: ps.metrics, usuariosReais: ps.field, oportunidades: ps.opportunities, seoFalhou: ps.failedSeo }
    : { erro: ps.error };
}

export async function writeReport(input: {
  url: string;
  scores: Scores;
  pagespeed: { mobile: PageSpeedResult; desktop: PageSpeedResult };
  site: SiteChecks;
  business: BusinessResult;
}): Promise<Report | null> {
  if (!aiEnabled()) return null;
  const data = {
    site: input.url,
    notas: input.scores,
    pagespeedCelular: compact(input.pagespeed.mobile),
    pagespeedComputador: compact(input.pagespeed.desktop),
    blogFrequencia: input.site.blogActivity ?? null,
    checagensDoSite: input.site.ok ? input.site.checks.map((c) => ({ item: c.label, ok: c.ok, detalhe: c.detail })) : { erro: input.site.error },
    googleEmpresas: input.business.found
      ? {
          nome: input.business.name,
          categoria: input.business.category,
          nota: input.business.rating,
          avaliacoes: input.business.reviews,
          checagens: input.business.checks,
          unidades: input.business.units ?? [],
        }
      : { encontrado: false, motivo: input.business.error ?? "Perfil não encontrado na busca pelo nome/cidade." },
  };
  return generate(
    reportSchema,
    { system: SYSTEM, user: `Dados medidos agora:\n${JSON.stringify(data, null, 1)}\n\nEscreva o diagnóstico.` },
    { maxTokens: 8000, timeoutMs: 150_000, effort: "medium", task: "diagnostico" },
  );
}
