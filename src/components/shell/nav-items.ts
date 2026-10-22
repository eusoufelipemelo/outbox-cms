import {
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  FileText,
  Gauge,
  Images,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  Plug,
  SlidersHorizontal,
  Store,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Mapa do CMS: o menu lateral e a busca rápida (⌘K) leem daqui.
 * `hint` diz o que se faz na tela; `keywords` são os nomes que a equipe usa no dia a dia.
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; hint: string; keywords: string[] };
export type NavGroup = { label: string | null; adminOnly?: boolean; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Painel", icon: LayoutGrid, exact: true, hint: "Visão geral de blog, Google Empresas e Instagram", keywords: ["dashboard", "inicio", "graficos", "resumo"] },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/clientes", label: "Clientes e sites", icon: Users, hint: "Cadastro, sites, voz da marca e filiais", keywords: ["cliente", "site", "dominio", "cadastro", "conexao", "filial", "unidade"] },
      { href: "/servicos", label: "Serviços", icon: Boxes, hint: "O que cada cliente contratou e as conexões", keywords: ["plano", "pacote", "contrato", "telegram", "ligar instagram", "ligar linkedin"] },
      { href: "/mapa", label: "Mapa", icon: MapIcon, hint: "Clientes por estado e cidade", keywords: ["estados", "cidades", "regiao"] },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { href: "/artigos", label: "Artigos", icon: FileText, hint: "Escrever, revisar e publicar no blog", keywords: ["blog", "post", "publicar", "rascunho", "texto"] },
      { href: "/pautas", label: "Pautas", icon: Lightbulb, hint: "Ideias de temas para os próximos artigos", keywords: ["ideias", "temas", "sugestoes"] },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, hint: "Calendário do que foi e vai ao ar", keywords: ["calendario", "agendado", "mes"] },
      { href: "/automacao", label: "Automação", icon: Bot, hint: "Artigos automáticos e aprovação pelo Telegram", keywords: ["automatico", "robo", "telegram", "aprovacao", "rodar agora"] },
      { href: "/midia", label: "Mídia", icon: Images, hint: "Biblioteca de imagens e gerar imagem com IA", keywords: ["imagens", "fotos", "capas", "gerar imagem", "biblioteca"] },
    ],
  },
  {
    label: "Canais",
    items: [
      { href: "/google-empresas", label: "Google Empresas", icon: Store, exact: true, hint: "Perfis, avaliações e publicações no Google", keywords: ["gbp", "maps", "avaliacoes", "perfil da empresa"] },
      { href: "/google-empresas/otimizacao", label: "Otimização Google", icon: ListChecks, hint: "Checklist para deixar o perfil completo", keywords: ["checklist", "roteiro", "otimizar", "otimizacao"] },
      { href: "/instagram", label: "Instagram", icon: Camera, hint: "Carrosséis, stories e aprovações", keywords: ["carrossel", "stories", "refazer fotos", "feed"] },
      { href: "/linkedin", label: "LinkedIn", icon: BriefcaseBusiness, hint: "Páginas de empresa e posts dos artigos", keywords: ["pagina de empresa", "conectar linkedin"] },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { href: "/diagnosticos", label: "Diagnóstico", icon: Gauge, hint: "Relatório de site, SEO e Google para clientes e prospects", keywords: ["relatorio", "pagespeed", "seo", "geo", "prospect", "analise"] },
      { href: "/integracoes", label: "Integrações", icon: Plug, hint: "Como ligar os sites ao CMS (API, WordPress, webhook)", keywords: ["api", "chave do site", "wordpress", "webhook"] },
    ],
  },
  {
    label: "Administração",
    adminOnly: true,
    items: [
      { href: "/equipe", label: "Equipe", icon: UserCog, hint: "Usuários, acessos e aprovações de conta", keywords: ["usuarios", "acessos", "convites"] },
      { href: "/painel", label: "Painel admin", icon: SlidersHorizontal, hint: "Chaves de API, modelos de IA e conexões", keywords: ["chaves", "api key", "openrouter", "gemini", "modelos", "configuracoes", "meta", "telegram bot"] },
    ],
  },
];

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
