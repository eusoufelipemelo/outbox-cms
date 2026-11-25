/**
 * Grade do "programa de TV" do Instagram da OutBox (@eusoufelipemelo): um programa por dia da semana,
 * sempre no mesmo horário, no formato tweet. `news`: o programa precisa das notícias do dia.
 */

export type ProgramId = "giro" | "prompt" | "ferramenta" | "negocio" | "plantao" | "meme" | "mito";

export type Program = {
  id: ProgramId;
  name: string;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  news: boolean;
  /** "capa": capa chamativa com foto e manchete gigante; "tweet": tudo no formato tweet. Intercalados na semana. */
  format: "capa" | "tweet";
  /** Lâminas de conteúdo, fora a capa e o fechamento. */
  slides: [number, number];
  brief: string;
  closing: string;
};

export const PROGRAMS: Program[] = [
  {
    id: "giro",
    format: "capa",
    name: "Giro da IA",
    weekday: 1,
    news: true,
    slides: [4, 5],
    brief:
      "As notícias de IA mais importantes dos últimos dias, uma por lâmina: o que aconteceu, em linguagem de gente, e por que importa para quem tem empresa no Brasil. Escolha só notícias da lista, de empresas e fontes diferentes.",
    closing: "Toda segunda tem Giro da IA aqui no perfil.",
  },
  {
    id: "prompt",
    format: "capa",
    name: "Prompt na Prática",
    weekday: 2,
    news: false,
    slides: [3, 4],
    brief:
      "Um prompt pronto para o dono de pequena empresa copiar e usar hoje (ChatGPT, Gemini ou Claude), para uma tarefa real: responder cliente, criar orçamento, planejar a semana, escrever post. Mostre o problema, o prompt completo numa lâmina (entre aspas), como adaptar e o resultado esperado.",
    closing: "Salva este post e testa hoje mesmo.",
  },
  {
    id: "ferramenta",
    format: "tweet",
    name: "Ferramenta da Semana",
    weekday: 3,
    news: true,
    slides: [3, 4],
    brief:
      "Uma ferramenta ou recurso novo de IA que apareceu nas notícias: o que é, para que serve no dia a dia de uma empresa, quanto custa (só se a notícia disser) e como começar. Prefira algo útil e acessível. Nada de inventar recurso que a notícia não cita.",
    closing: "Toda quarta tem Ferramenta da Semana.",
  },
  {
    id: "negocio",
    format: "tweet",
    name: "IA no Seu Negócio",
    weekday: 4,
    news: false,
    slides: [3, 4],
    brief:
      "Como um tipo de negócio local (marcenaria, clínica, loja, escritório, restaurante, oficina) usa IA na prática hoje: o problema, a solução passo a passo, o ganho de tempo ou dinheiro de forma realista. Exemplo plausível, sem citar empresa real nem números inventados como se fossem fatos.",
    closing: "Quer isso na sua empresa? Fala comigo pelo link da bio.",
  },
  {
    id: "plantao",
    format: "capa",
    name: "Plantão IA",
    weekday: 5,
    news: true,
    slides: [3, 4],
    brief:
      "A notícia de IA mais quente da semana explicada a fundo: o que aconteceu, os detalhes que importam, o que muda para empresas e pessoas, e a sua opinião sincera (Felipe) no fim. Uma notícia só, da lista.",
    closing: "Toda sexta tem Plantão IA. Ativa as notificações.",
  },
  {
    id: "meme",
    format: "tweet",
    name: "Meme da Semana",
    weekday: 6,
    news: false,
    slides: [2, 3],
    brief:
      "Humor leve sobre o dia a dia com IA que todo empreendedor reconhece (prompt que deu errado, a IA educada demais, o chefe que acha que IA faz tudo). Cada lâmina é uma situação engraçada curta, com uma cena visual divertida e original. Sem ofender ninguém, sem pessoas reais, sem marcas.",
    closing: "Marca aquele amigo que faz isso.",
  },
  {
    id: "mito",
    format: "capa",
    name: "Mito ou Verdade",
    weekday: 0,
    news: false,
    slides: [3, 4],
    brief:
      "Uma crença comum sobre IA (vai roubar meu emprego, sabe tudo, é só pra empresa grande, o que eu escrevo vira público) e a resposta honesta: mito, verdade ou depende, com explicação clara e um conselho prático. Termine pedindo a opinião nos comentários.",
    closing: "Mito ou verdade? Comenta aí.",
  },
];

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Programa do dia (no fuso de Brasília). */
export function programFor(date: Date): Program {
  const day = WD[new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(date)] ?? 1;
  return PROGRAMS.find((p) => p.weekday === day) ?? PROGRAMS[0];
}

export function programById(id: string | null | undefined): Program | null {
  return PROGRAMS.find((p) => p.id === id) ?? null;
}
