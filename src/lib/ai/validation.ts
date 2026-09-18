import { z } from "zod";
import type { AiAction, AiInput } from "./types";

// Validação das entradas de POST /api/ai (zod v4). Mensagens em pt-BR, dizendo o que corrigir.

export const AI_ACTIONS = ["titles", "outline", "draft", "improve", "seo", "variation"] as const satisfies readonly AiAction[];

export const MAX_HTML_CHARS = 60_000;
export const DEFAULT_WORDS = 1000;

/** Trata `""`, espaços e `null` como campo ausente (o editor costuma mandar assim). */
const blankToUndefined = (v: unknown) =>
  v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;

const optionalText = (max: number, label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .string({ error: `${label} precisa ser texto.` })
      .trim()
      .max(max, `${label} pode ter no máximo ${max} caracteres.`)
      .optional(),
  );

const optionalId = (label: string) =>
  z.preprocess(blankToUndefined, z.uuid({ error: `${label} inválido. Selecione de novo.` }).optional());

const requiredId = (label: string) =>
  z.uuid({ error: `${label} inválido. Salve o artigo e selecione o site de novo.` });

const keyword = optionalText(80, "A palavra-chave");
const clientId = optionalId("Cliente");

const html = (label: string, minChars: number) =>
  z
    .string({ error: `Envie ${label}.` })
    .max(MAX_HTML_CHARS, `${label[0].toUpperCase()}${label.slice(1)} passa de ${MAX_HTML_CHARS.toLocaleString("pt-BR")} caracteres. Envie um trecho menor.`)
    .refine(
      (v) => v.replace(/<[^>]*>/g, "").trim().length >= minChars,
      `${label[0].toUpperCase()}${label.slice(1)} está vazio ou curto demais.`,
    );

export const inputSchemas = {
  titles: z.object({
    topic: z
      .string({ error: "Informe o tema do artigo." })
      .trim()
      .min(3, "Descreva o tema com pelo menos 3 caracteres.")
      .max(300, "O tema pode ter no máximo 300 caracteres."),
    keyword,
    clientId,
  }),
  outline: z.object({
    title: z
      .string({ error: "Informe o título do artigo." })
      .trim()
      .min(5, "Escreva um título antes de gerar a estrutura.")
      .max(200, "O título pode ter no máximo 200 caracteres."),
    keyword,
    clientId,
  }),
  draft: z.object({
    title: z
      .string({ error: "Informe o título do artigo." })
      .trim()
      .min(5, "Escreva um título antes de gerar o rascunho.")
      .max(200, "O título pode ter no máximo 200 caracteres."),
    outlineHtml: optionalText(20_000, "A estrutura"),
    keyword,
    clientId,
    words: z.preprocess(
      blankToUndefined,
      z
        .number({ error: "O tamanho precisa ser um número de palavras." })
        .int("Use um número inteiro de palavras.")
        .min(300, "Peça pelo menos 300 palavras.")
        .max(3000, "Peça no máximo 3.000 palavras por vez.")
        .optional(),
    ),
  }),
  improve: z.object({
    html: html("o texto a melhorar", 2),
    instruction: z
      .string({ error: "Diga o que mudar no texto." })
      .trim()
      .min(3, "Diga o que mudar no texto (ex.: \"deixe mais direto\").")
      .max(1000, "A instrução pode ter no máximo 1.000 caracteres."),
  }),
  seo: z.object({
    title: z
      .string({ error: "Informe o título do artigo." })
      .trim()
      .min(5, "Escreva um título antes de gerar o SEO.")
      .max(200, "O título pode ter no máximo 200 caracteres."),
    html: html("o conteúdo do artigo", 50),
    keyword,
  }),
  variation: z.object({
    postId: requiredId("Artigo"),
    siteId: requiredId("Site"),
  }),
} satisfies { [A in AiAction]: z.ZodType<AiInput[A], unknown> };

export const requestSchema = z.object({
  action: z.enum(AI_ACTIONS, { error: "Ação desconhecida para o assistente." }),
  input: z.record(z.string(), z.unknown(), { error: "Envie os dados do pedido em `input`." }),
});

/** Primeira mensagem de erro legível do zod. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dados inválidos.";
  // Mensagens definidas acima já são pt-BR; as padrão do zod vêm em inglês.
  const custom = issue.message && !/^Invalid|^Expected|^Unrecognized|^Too (big|small)/.test(issue.message);
  if (custom) return issue.message;
  const field = issue.path.join(".");
  return field ? `Campo "${field}" inválido. Confira e tente de novo.` : "Dados inválidos. Confira e tente de novo.";
}
