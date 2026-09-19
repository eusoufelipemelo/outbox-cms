// Rótulos e listas do assistente, seguros para servidor e navegador.
import type { ContentType } from "@/lib/types";
import type { AiOutput } from "./types";

export const CONTENT_TYPES = ["article", "howto", "guide", "list", "comparison", "news"] as const satisfies readonly ContentType[];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  article: "Artigo",
  howto: "Passo a passo",
  guide: "Guia completo",
  list: "Lista",
  comparison: "Comparação",
  news: "Novidade",
};

export type IdeaIntent = AiOutput["ideas"]["ideas"][number]["intent"];

export const IDEA_INTENTS = ["informacional", "comercial", "local", "comparativa"] as const satisfies readonly IdeaIntent[];

export const IDEA_INTENT: Record<IdeaIntent, { label: string; tone: "neutral" | "info" | "ok" | "warn" }> = {
  informacional: { label: "Informacional", tone: "info" },
  comercial: { label: "Comercial", tone: "ok" },
  local: { label: "Local", tone: "warn" },
  comparativa: { label: "Comparativa", tone: "neutral" },
};
