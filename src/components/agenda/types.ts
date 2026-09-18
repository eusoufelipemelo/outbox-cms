export type AgendaPost = {
  id: string;
  title: string;
  kind: "scheduled" | "published";
  /** Instante (ISO) do agendamento ou da publicação. */
  at: string;
  /** Dia em Brasília (YYYY-MM-DD). */
  day: string;
  /** Quantos sites recebem (ou receberam) o artigo. */
  destinations: number;
};
