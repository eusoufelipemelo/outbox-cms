/**
 * Roteiro de otimização do Perfil da Empresa no Google, na ordem em que o trabalho é feito.
 * As chaves ficam gravadas no banco: renomear o texto é livre, trocar a chave apaga o que foi marcado.
 */

export type ChecklistItem = {
  key: string;
  label: string;
  /** Como fazer, em uma ou duas frases. */
  how: string;
  /** Texto de exemplo do campo de anotação, quando vale registrar o que foi decidido. */
  note?: string;
};

export type ChecklistStep = { id: string; title: string; items: ChecklistItem[] };

export const CHECKLIST: ChecklistStep[] = [
  {
    id: "diagnostico",
    title: "Diagnóstico",
    items: [
      { key: "diag_cms", label: "Rodar o Diagnóstico do CMS", how: "Em Diagnóstico, com o site e o perfil do cliente. Guarde o link do relatório como ponto de partida." },
      {
        key: "diag_concorrentes",
        label: "Anotar os 3 primeiros concorrentes no Maps",
        how: "Pesquise o serviço principal + a cidade no Google Maps. Veja categorias, número de avaliações e fotos de cada um.",
        note: "Ex.: Marcenaria X (cat. Marcenaria, 120 aval.), …",
      },
      { key: "diag_antes", label: "Tirar os prints do perfil antes", how: "Perfil aberto no Google e no Maps, no celular e no computador. Vão para o relatório de antes e depois." },
    ],
  },
  {
    id: "acesso",
    title: "Acesso",
    items: [
      { key: "acesso_admin", label: "OutBox adicionada como administradora", how: "O cliente adiciona em Perfil → Menu → Gerentes do perfil. Ele continua como proprietário." },
      { key: "acesso_verificado", label: "Perfil verificado", how: "Se ainda não estiver, oriente o cliente na verificação (geralmente por vídeo). Sem verificação, as mudanças não aparecem." },
    ],
  },
  {
    id: "dados",
    title: "Dados principais",
    items: [
      { key: "dados_nome", label: "Nome igual ao nome real da empresa", how: "Sem palavra-chave, cidade ou slogan no nome: isso viola as regras do Google e pode suspender o perfil." },
      { key: "dados_nap", label: "Endereço e telefone iguais ao site e às redes", how: "Mesma grafia em todo lugar. Telefone com WhatsApp de preferência." },
      { key: "dados_area", label: "Área de atendimento configurada", how: "Cidades e bairros atendidos. Se atende só a domicílio, oculte o endereço." },
      { key: "dados_horarios", label: "Horários e feriados", how: "Horário normal e horários especiais dos próximos feriados." },
    ],
  },
  {
    id: "categorias",
    title: "Categorias e descrição",
    items: [
      { key: "cat_principal", label: "Categoria principal", how: "A mais específica para o serviço que mais traz cliente. É o que mais pesa no ranqueamento.", note: "Categoria escolhida" },
      { key: "cat_secundarias", label: "3 a 6 categorias secundárias", how: "Só as que o cliente realmente atende. Use as dos concorrentes como referência.", note: "Categorias escolhidas" },
      { key: "cat_descricao", label: "Descrição de até 750 caracteres", how: "O que a empresa faz, para quem e onde, com os serviços e a cidade escritos de forma natural." },
      { key: "cat_abertura", label: "Data de abertura", how: "Ano (e mês, se souber) em que a empresa começou." },
    ],
  },
  {
    id: "servicos",
    title: "Serviços, produtos e links",
    items: [
      { key: "serv_servicos", label: "Serviços cadastrados com descrição", how: "Um por serviço, com descrição curta e preço ou faixa de preço quando o cliente quiser mostrar." },
      { key: "serv_produtos", label: "Produtos (se fizer sentido)", how: "Para quem vende produto: foto, nome, descrição e link. Pule se não se aplica." },
      { key: "serv_atributos", label: "Atributos marcados", how: "Formas de pagamento, acessibilidade, atendimento online e o que mais se aplicar." },
      { key: "serv_links", label: "Links de site, WhatsApp e agendamento", how: "Site com o endereço certo, botão de WhatsApp e link de agendamento, se houver." },
    ],
  },
  {
    id: "fotos",
    title: "Fotos",
    items: [
      { key: "fotos_logo", label: "Logo e foto de capa", how: "Logo quadrado e uma capa horizontal que mostre o melhor do negócio." },
      { key: "fotos_reais", label: "15 a 25 fotos reais", how: "Fachada, ambiente, equipe e trabalhos feitos. Nada de banco de imagens." },
    ],
  },
  {
    id: "avaliacoes",
    title: "Avaliações",
    items: [
      { key: "aval_respondidas", label: "Todas as avaliações respondidas", how: "Inclusive as antigas e as negativas, no tom do cliente. Em Google Empresas, a IA sugere a resposta." },
      { key: "aval_link", label: "Link curto de avaliação criado", how: "No perfil, em Pedir avaliações. Guarde o link aqui.", note: "Link de avaliação" },
      { key: "aval_kit", label: "Mensagem pronta e QR code entregues", how: "Texto para o cliente mandar no WhatsApp depois do serviço e QR code para o balcão. Nada de avaliação comprada." },
    ],
  },
  {
    id: "posts",
    title: "Publicações",
    items: [{ key: "posts_iniciais", label: "3 a 4 publicações iniciais", how: "Apresentação, serviço principal, diferencial e uma oferta ou novidade." }],
  },
  {
    id: "consistencia",
    title: "Consistência fora do Google",
    items: [
      { key: "cons_bing", label: "Bing Places", how: "Importe o perfil do Google em bingplaces.com." },
      { key: "cons_apple", label: "Apple Business Connect", how: "Mesmo nome, endereço e telefone para aparecer no Mapas do iPhone." },
      { key: "cons_redes", label: "Facebook e Instagram com os mesmos dados", how: "Nome, endereço, telefone, horário e site iguais ao perfil do Google." },
      { key: "cons_site", label: "Site com os mesmos dados", how: "Rodapé e página de contato batendo com o perfil." },
    ],
  },
  {
    id: "entrega",
    title: "Entrega",
    items: [
      { key: "ent_relatorio", label: "Relatório de antes e depois enviado", how: "Prints de antes e depois, o que foi feito e o resultado do Diagnóstico de novo." },
      { key: "ent_guia", label: "Cliente orientado a pedir avaliações", how: "Explique quando e como pedir avaliação e onde ele acompanha o perfil." },
    ],
  },
];

export const ALL_KEYS = CHECKLIST.flatMap((s) => s.items.map((i) => i.key));

export type ItemState = { done?: boolean; at?: string; note?: string };
export type ChecklistState = Record<string, ItemState>;

export function progress(items: ChecklistState): { done: number; total: number; pct: number } {
  const done = ALL_KEYS.filter((k) => items[k]?.done).length;
  return { done, total: ALL_KEYS.length, pct: Math.round((done / ALL_KEYS.length) * 100) };
}
