import type { BusinessResult } from "./business";
import type { PageSpeedResult } from "./pagespeed";
import type { Report } from "./report";
import { SCORE_LABELS, type Scores } from "./scoring";
import type { SiteChecks } from "./site-checks";

/**
 * Relatório padrão, sem IA (custo zero): cada problema detectado tem um texto pronto,
 * revisado pela OutBox, com o impacto para o negócio e a correção.
 */

type Problem = Report["problems"][number];
type Sev = Problem["severity"];

const TEXTS: Record<string, { area: Problem["area"]; severity: Sev; title: string; impact: string; fix: string; phase: 1 | 2 | 3 }> = {
  https: { area: "SEO técnico", severity: "alta", phase: 1, title: "Site sem cadeado de segurança", impact: "O navegador marca o site como não seguro e o Google rebaixa páginas sem HTTPS. Muitos visitantes saem antes de ler.", fix: "Instalamos o certificado de segurança e redirecionamos todos os endereços para a versão com cadeado." },
  index: { area: "SEO técnico", severity: "alta", phase: 1, title: "Página bloqueada para o Google", impact: "A página está marcada para não aparecer no Google. Nenhuma busca leva clientes até ela.", fix: "Removemos o bloqueio e pedimos ao Google uma nova leitura do site." },
  title: { area: "SEO técnico", severity: "media", phase: 1, title: "Título da página fora do ideal", impact: "O título é o texto azul que aparece no Google. Fora do tamanho ideal ou sem a palavra certa, recebe menos cliques.", fix: "Reescrevemos o título com o serviço principal e a cidade, entre 30 e 60 caracteres." },
  description: { area: "SEO técnico", severity: "media", phase: 1, title: "Descrição para o Google ausente ou fora do tamanho", impact: "Sem uma boa descrição, o Google mostra um trecho qualquer do site e o anúncio gratuito perde força.", fix: "Escrevemos uma descrição persuasiva de 120 a 160 caracteres para cada página importante." },
  h1: { area: "SEO técnico", severity: "media", phase: 1, title: "Título principal da página mal estruturado", impact: "O Google usa o título principal (H1) para entender do que a página trata. Ausente ou repetido, ele confunde a leitura.", fix: "Deixamos um único título principal por página, com o serviço e a região." },
  canonical: { area: "SEO técnico", severity: "baixa", phase: 1, title: "Endereço oficial da página não definido", impact: "Sem o endereço oficial (canonical), o Google pode ver páginas duplicadas e dividir a relevância entre elas.", fix: "Definimos o endereço oficial em todas as páginas." },
  mobile: { area: "SEO técnico", severity: "alta", phase: 1, title: "Site não se adapta ao celular", impact: "A maior parte das visitas vem do celular, e o Google avalia primeiro a versão mobile.", fix: "Ajustamos o layout para funcionar bem em qualquer tela." },
  lang: { area: "SEO técnico", severity: "baixa", phase: 1, title: "Idioma do site não declarado", impact: "Sem o idioma declarado, buscadores e leitores de tela têm mais dificuldade para interpretar o conteúdo.", fix: "Declaramos o idioma português do Brasil no código do site." },
  sitemap: { area: "SEO técnico", severity: "media", phase: 1, title: "Site sem mapa para o Google", impact: "Sem o sitemap, o Google demora mais para encontrar páginas novas e artigos.", fix: "Criamos o sitemap automático e o enviamos ao Google Search Console." },
  alt: { area: "SEO técnico", severity: "baixa", phase: 2, title: "Imagens sem descrição", impact: "Imagens sem descrição (alt) não aparecem na busca de imagens e prejudicam a acessibilidade.", fix: "Descrevemos as imagens com textos curtos e relevantes." },
  og: { area: "Conversão", severity: "baixa", phase: 1, title: "Link feio quando compartilhado", impact: "Ao enviar o site pelo WhatsApp ou redes sociais, o link aparece sem imagem e sem título atraente.", fix: "Configuramos imagem e título de compartilhamento para as páginas principais." },
  content: { area: "SEO técnico", severity: "media", phase: 2, title: "Pouco texto na página inicial", impact: "Com pouco conteúdo, o Google não tem o que ranquear e o visitante não encontra respostas.", fix: "Reforçamos a página inicial com textos claros sobre serviços, diferenciais e região atendida." },
  schema: { area: "Preparo para IAs", severity: "alta", phase: 1, title: "Google e IAs não sabem quem é a empresa", impact: "Sem dados estruturados, o Google e as IAs não identificam nome, endereço, serviços e horários da empresa.", fix: "Adicionamos os dados estruturados da empresa (Schema.org) em todas as páginas." },
  faq: { area: "Preparo para IAs", severity: "media", phase: 3, title: "Sem perguntas frequentes estruturadas", impact: "Assistentes como ChatGPT e Gemini adoram respostas diretas. Sem FAQ, a empresa perde espaço nessas respostas.", fix: "Criamos perguntas frequentes reais do nicho, marcadas para o Google e para as IAs." },
  llms: { area: "Preparo para IAs", severity: "media", phase: 3, title: "Site sem guia para assistentes de IA", impact: "O llms.txt é o resumo do site pensado para IAs. Sem ele, elas entendem menos o negócio e citam menos a empresa.", fix: "Publicamos o llms.txt com os serviços, diferenciais e principais conteúdos." },
  bots: { area: "Preparo para IAs", severity: "alta", phase: 1, title: "Site bloqueia as IAs", impact: "O site impede que ChatGPT, Claude ou Perplexity leiam as páginas. A empresa não é citada nessas respostas.", fix: "Liberamos o acesso das IAs no robots.txt, mantendo protegidas as áreas privadas." },
  blog: { area: "Preparo para IAs", severity: "alta", phase: 2, title: "Sem blog com conteúdo próprio", impact: "Sem artigos, o site aparece só para quem já conhece a marca. Conteúdo é o que traz buscas novas e citações em IAs.", fix: "Publicamos artigos mensais com SEO e GEO pelo CMS da OutBox, respondendo às dúvidas reais dos clientes." },
  whatsapp: { area: "Conversão", severity: "media", phase: 1, title: "Sem botão de WhatsApp", impact: "O visitante interessado precisa procurar como falar com a empresa, e muitos desistem no caminho.", fix: "Adicionamos botão de WhatsApp visível em todas as páginas, com mensagem pronta." },
  tel: { area: "Conversão", severity: "baixa", phase: 1, title: "Telefone não é clicável", impact: "No celular, o cliente precisa copiar o número em vez de tocar para ligar.", fix: "Deixamos o telefone clicável em todo o site." },
};

const SEV_ORDER: Record<Sev, number> = { alta: 0, media: 1, baixa: 2 };

function speedProblem(ps: PageSpeedResult): (Problem & { phase: 1 }) | null {
  const perf = ps.scores.performance;
  if (!ps.ok || perf === null || perf >= 90) return null;
  const lcp = ps.metrics.find((m) => m.label.includes("LCP"));
  return {
    area: "Velocidade",
    severity: perf < 50 ? "alta" : "media",
    phase: 1,
    title: perf < 50 ? "Site lento no celular" : "Velocidade no celular abaixo do ideal",
    impact: `A nota de velocidade no celular é ${perf} de 100${lcp ? ` e o conteúdo principal leva ${lcp.value} para aparecer` : ""}. Cada segundo a mais faz visitantes desistirem, e o Google favorece sites rápidos.`,
    fix: "Otimizamos imagens, carregamento de scripts e hospedagem até a nota passar de 90 no celular.",
  };
}

function businessProblems(b: BusinessResult): (Problem & { phase: 1 | 2 | 3 })[] {
  if (b.error) return [];
  if (!b.found) {
    return [
      {
        area: "Google Empresas",
        severity: "alta",
        phase: 1,
        title: "Empresa sem perfil no Google Empresas ligado ao site",
        impact: "Sem um perfil completo e ligado ao site, a empresa não aparece no Google Maps nem nas buscas por perto de mim, onde está a maior parte dos clientes locais.",
        fix: "Criamos ou recuperamos o perfil, verificamos a empresa, ligamos ao site e completamos todas as informações.",
      },
    ];
  }
  const out: (Problem & { phase: 1 | 2 | 3 })[] = [];
  const failed = (label: string) => b.checks.find((c) => c.label.startsWith(label) && !c.ok);
  if (failed("Empresa ativa")) out.push({ area: "Google Empresas", severity: "alta", phase: 1, title: "Perfil no Google não aparece como em funcionamento", impact: "Clientes podem achar que a empresa fechou.", fix: "Corrigimos o status do perfil com o suporte do Google." });
  if (failed("Site vinculado")) out.push({ area: "Google Empresas", severity: "alta", phase: 1, title: "Perfil do Google não leva ao site", impact: "Quem encontra a empresa no Maps não chega ao site, e o Google não conecta a autoridade do perfil com a do site.", fix: "Vinculamos o site certo ao perfil, com rastreamento dos cliques." });
  const reviews = b.reviews ?? 0;
  if (failed("Pelo menos 50")) out.push({ area: "Google Empresas", severity: reviews < 10 ? "alta" : "media", phase: 2, title: "Poucas avaliações no Google", impact: `São ${reviews} avaliações. Na hora de escolher, o cliente compara e confia em quem tem mais opiniões.`, fix: "Implantamos uma rotina simples de pedido de avaliação após cada atendimento, com link direto." });
  if (failed("Nota média")) out.push({ area: "Google Empresas", severity: "media", phase: 2, title: "Nota do Google abaixo de 4,5", impact: "Notas abaixo de 4,5 reduzem cliques e ligações vindas do Maps.", fix: "Respondemos às avaliações, tratamos as críticas e aumentamos as avaliações de clientes satisfeitos." });
  if (failed("Avaliação recente")) out.push({ area: "Google Empresas", severity: "media", phase: 2, title: "Perfil sem avaliações recentes", impact: "O Google e os clientes valorizam perfis ativos. Um perfil parado perde posição no Maps.", fix: "Mantemos um fluxo constante de avaliações e publicações semanais no perfil." });
  if (failed("Fotos")) out.push({ area: "Google Empresas", severity: "media", phase: 1, title: "Poucas fotos no perfil do Google", impact: "Perfis com fotos recebem mais pedidos de rota e visitas ao site.", fix: "Publicamos fotos profissionais do espaço, da equipe e dos trabalhos, com atualização mensal." });
  if (failed("Horário")) out.push({ area: "Google Empresas", severity: "baixa", phase: 1, title: "Perfil sem horário de funcionamento", impact: "O cliente não sabe se a empresa está aberta e escolhe outra.", fix: "Cadastramos o horário e os feriados." });
  if (failed("Telefone")) out.push({ area: "Google Empresas", severity: "media", phase: 1, title: "Perfil sem telefone", impact: "O botão Ligar do Google não aparece, e quem quer falar na hora desiste.", fix: "Cadastramos telefone e WhatsApp no perfil." });
  return out;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function templateReport(input: {
  url: string;
  scores: Scores;
  pagespeed: { mobile: PageSpeedResult; desktop: PageSpeedResult };
  site: SiteChecks;
  business: BusinessResult;
}): Report {
  const { scores } = input;
  const found: (Problem & { phase: 1 | 2 | 3 })[] = [];
  const speed = speedProblem(input.pagespeed.mobile);
  if (speed) found.push(speed);
  found.push(...businessProblems(input.business));
  if (input.site.ok) {
    for (const c of input.site.checks) if (!c.ok && TEXTS[c.id]) found.push(TEXTS[c.id]);
  }
  found.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const problems = found.slice(0, 8);

  // Resumo a partir das notas
  const rated = SCORE_LABELS.map((s) => ({ label: s.label, v: scores[s.key] })).filter((s): s is { label: string; v: number } => s.v !== null);
  const weak = rated.filter((s) => s.v < 70).sort((a, b) => a.v - b.v);
  const strong = rated.filter((s) => s.v >= 90);
  const host = hostOf(input.url);
  const parts = [
    scores.overall !== null ? `O site ${host} tem nota geral ${scores.overall} de 100 na presença digital.` : `Analisamos a presença digital de ${host}.`,
    weak.length
      ? `Os pontos que mais seguram o crescimento hoje são ${weak.map((w) => `${w.label} (${w.v})`).join(" e ")}.`
      : "A base está bem montada, e o ganho agora vem de conteúdo e constância.",
    strong.length ? `${strong.map((s) => s.label).join(" e ")} já ${strong.length > 1 ? "estão" : "está"} em bom nível.` : "",
    `Encontramos ${found.length} ${found.length === 1 ? "ponto de melhoria" : "pontos de melhoria"}, ${found.filter((p) => p.severity === "alta").length} de prioridade alta. Corrigidos em ordem, eles aumentam a chance de a empresa ser encontrada no Google, no Maps e nas respostas de IAs.`,
  ].filter(Boolean);

  const fixesFor = (phase: 1 | 2 | 3, max: number) =>
    found
      .filter((p) => p.phase === phase)
      .slice(0, max)
      .map((p) => p.fix.replace(/\.$/, ""));
  // Ações genéricas completam a fase sem repetir o tema de uma ação já listada.
  const TOPICS = ["avalia", "perguntas frequentes", "whatsapp", "fotos", "artigos", "search console"];
  const topic = (t: string) => TOPICS.find((k) => t.toLowerCase().includes(k));
  const pad = (list: string[], extra: string[], min = 3) => {
    const out = [...list];
    for (const e of extra) {
      const k = topic(e);
      if (out.length < min + 1 && !out.some((o) => o === e || (k && topic(o) === k))) out.push(e);
    }
    return out.slice(0, 5);
  };

  const plan: Report["plan"] = [
    {
      period: "Meses 1 e 2",
      focus: "Base técnica e Google Empresas",
      actions: pad(fixesFor(1, 5), ["Configuramos Google Search Console e Analytics para medir a evolução", "Revisamos o perfil do Google Empresas de ponta a ponta", "Corrigimos os erros técnicos que o Google aponta hoje"]),
      result: "Site rápido, sem erros técnicos e perfil do Google completo, pronto para crescer.",
    },
    {
      period: "Meses 3 e 4",
      focus: "Conteúdo e autoridade",
      actions: pad(fixesFor(2, 4), ["Publicamos artigos mensais com SEO e GEO sobre as dúvidas reais dos clientes", "Criamos rotina de pedido de avaliações no Google", "Publicamos novidades semanais no perfil do Google Empresas"]),
      result: "Primeiras buscas novas chegando pelo blog e perfil do Google mais ativo e bem avaliado.",
    },
    {
      period: "Meses 5 e 6",
      focus: "Preparo para IAs e conversão",
      actions: pad(fixesFor(3, 4), ["Reforçamos perguntas frequentes e dados estruturados para as IAs", "Ajustamos chamadas para WhatsApp e contato nas páginas mais visitadas", "Revisamos os resultados e ajustamos as palavras-chave"]),
      result: "Prazo mínimo concluído: problemas principais resolvidos e empresa preparada para ser citada por IAs.",
    },
    {
      period: "Meses 7 a 12",
      focus: "Consolidação e crescimento",
      actions: [
        "Mantemos a publicação mensal de artigos e ampliamos os temas",
        "Criamos páginas por serviço e por região atendida",
        "Acompanhamos posições no Google e citações em IAs, ajustando a estratégia",
        "Refazemos este diagnóstico a cada trimestre para medir a evolução",
      ],
      result: "Prazo ideal: autoridade consolidada, mais buscas orgânicas e contatos constantes vindos do Google e das IAs.",
    },
  ];

  return {
    summary: parts.join(" "),
    problems: problems.map((p) => ({ area: p.area, severity: p.severity, title: p.title, impact: p.impact, fix: p.fix })),
    plan,
    nextSteps: [
      "Aprovar o plano e definir quem da empresa será o contato com a OutBox",
      "Liberar acesso ao site, ao domínio e ao perfil do Google Empresas",
      "Agendar a reunião de início para alinhar serviços prioritários e região de atuação",
    ],
  };
}
