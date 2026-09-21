import type { BusinessResult } from "./business";
import type { SiteChecks } from "./site-checks";

/** Os três pilares que fazem uma IA recomendar a empresa: site legível (GEO), blog ativo e Google Empresas ativo. */

export type PillarStatus = "pronto" | "parcial" | "falta" | "sem-dados";

export type Pillar = {
  key: "geo" | "blog" | "gmb";
  title: string;
  short: string;
  why: string;
  status: PillarStatus;
  detail: string;
  action: string;
};

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function aiReadiness(site: SiteChecks | null, business: BusinessResult | null): Pillar[] {
  const check = (id: string) => site?.checks.find((c) => c.id === id);

  // 1. Site preparado para IAs
  const geoIds = ["schema", "faq", "llms", "bots"] as const;
  const geoOk = geoIds.filter((id) => check(id)?.ok);
  const PHRASE: Record<(typeof geoIds)[number], string> = {
    schema: "dados estruturados da empresa",
    faq: "perguntas frequentes marcadas",
    llms: "arquivo llms.txt",
    bots: "acesso liberado para as IAs",
  };
  const missing = geoIds.filter((id) => check(id) && !check(id)!.ok).map((id) => PHRASE[id]);
  const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}` : items[0]);
  const geo: Pillar = {
    key: "geo",
    title: "Site que a IA consegue ler",
    short: "Consigo ler e entender o site?",
    why: "A IA precisa entender em segundos quem é a empresa, o que faz, onde atende e para quem. Sem isso, ela prefere citar quem está mais claro.",
    status: !site?.ok ? "sem-dados" : geoOk.length === 4 ? "pronto" : geoOk.length >= 2 ? "parcial" : "falta",
    detail: !site?.ok
      ? "Não foi possível ler o site."
      : geoOk.length === 4
        ? "Dados estruturados, perguntas frequentes, llms.txt e acesso das IAs em ordem."
        : `O site ainda não tem ${list(missing)}.`,
    action: "Aplicamos GEO no site: dados estruturados da empresa, perguntas frequentes marcadas, llms.txt e acesso liberado para ChatGPT, Gemini, Claude e Perplexity.",
  };

  // 2. Blog ativo
  const act = site?.blogActivity;
  const hasBlog = Boolean(check("blog")?.ok);
  let blogStatus: PillarStatus;
  let blogDetail: string;
  if (!site?.ok) {
    blogStatus = "sem-dados";
    blogDetail = "Não foi possível ler o site.";
  } else if (!hasBlog) {
    blogStatus = "falta";
    blogDetail = "O site não tem blog. Não há conteúdo próprio para a IA citar.";
  } else if (act && act.recent !== null) {
    const last = act.lastPost ? ` Último artigo atualizado em ${fmt.format(new Date(act.lastPost))}.` : "";
    blogStatus = act.recent >= 4 ? "pronto" : act.recent >= 1 ? "parcial" : "falta";
    blogDetail = `${act.posts} ${act.posts === 1 ? "artigo" : "artigos"} no site, ${act.recent} ${act.recent === 1 ? "novo ou atualizado" : "novos ou atualizados"} nos últimos 90 dias.${last}`;
  } else {
    blogStatus = "parcial";
    blogDetail = act?.posts ? `${act.posts} artigos encontrados, sem data de publicação no sitemap para medir a frequência.` : "Existe um blog, mas não foi possível medir a frequência de publicação.";
  }
  const blog: Pillar = {
    key: "blog",
    title: "Blog ativo",
    short: "Tem conteúdo recente respondendo às dúvidas?",
    why: "As IAs citam páginas que respondem exatamente à pergunta do usuário. Artigos frequentes e atualizados são a matéria-prima dessas respostas.",
    status: blogStatus,
    detail: blogDetail,
    action: "Publicamos artigos mensais com SEO e GEO pelo CMS da OutBox, cada um respondendo a uma dúvida real dos clientes, com perguntas frequentes e fontes.",
  };

  // 3. Google Empresas ativo
  let gmbStatus: PillarStatus;
  let gmbDetail: string;
  if (!business || business.error) {
    gmbStatus = "sem-dados";
    gmbDetail = "Perfil não analisado.";
  } else if (!business.found) {
    gmbStatus = "falta";
    gmbDetail = "Não encontramos um perfil do Google Empresas ligado ao site.";
  } else {
    const ok = (label: string) => business.checks.find((c) => c.label.startsWith(label))?.ok;
    const active = ok("Avaliação recente") && ok("Pelo menos 50") && ok("Fotos") && ok("Site vinculado");
    gmbStatus = active ? "pronto" : "parcial";
    const rating = business.rating ? `nota ${business.rating.toFixed(1).replace(".", ",")}` : "sem nota";
    const recent = business.checks.find((c) => c.label.startsWith("Avaliação recente"))?.detail ?? "";
    gmbDetail = `${business.reviews ?? 0} avaliações, ${rating}. ${recent}`.trim();
  }
  const gmb: Pillar = {
    key: "gmb",
    title: "Google Empresas ativo",
    short: "Outras pessoas confirmam que é uma boa escolha?",
    why: "Para indicar um negócio local, a IA confere se ele existe, onde fica e o que os clientes dizem. Avaliações recentes e perfil completo pesam na escolha.",
    status: gmbStatus,
    detail: gmbDetail,
    action: "Gerimos o perfil: publicações semanais, fotos novas, respostas a todas as avaliações e rotina de pedido de avaliação após cada atendimento.",
  };

  return [geo, blog, gmb];
}

/** "Brasília" a partir de "Rua X, 123 - Asa Sul, Brasília - DF, 70000-000, Brasil". */
export function cityFromAddress(address?: string | null): string | null {
  return address?.match(/,\s*([^,]+?)\s-\s[A-Z]{2}\b/)?.[1]?.trim() ?? null;
}
