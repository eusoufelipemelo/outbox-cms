import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/supabase/admin";
import { setSnapshot, snapshotValues } from "./settings-store";

/**
 * Configurações do Painel administrativo: chaves de API e modelos, guardados no banco
 * (segredos cifrados) em vez de variáveis do Easypanel. O que estiver só no servidor é
 * importado para o painel na primeira leitura, para nada parar de funcionar na migração.
 */

export type Field = {
  key: string;
  label: string;
  hint?: string;
  /** Segredo: nunca volta inteiro para a tela, só os últimos caracteres. */
  secret?: boolean;
  placeholder?: string;
  /** Variável de ambiente equivalente (usada na importação automática). */
  envVar?: string;
  options?: { value: string; label: string }[];
  /** Sugestões que aparecem ao digitar (o campo continua livre). */
  suggestions?: string[];
};

export type Group = { id: string; title: string; description: string; fields: Field[]; note?: string };

/** Modelos do OpenRouter que costumam ir bem em cada tipo de trabalho (o campo aceita qualquer id). */
export const MODEL_SUGGESTIONS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.1",
  "openai/gpt-5.1-mini",
  "google/gemini-3-pro",
  "google/gemini-3-flash",
  "deepseek/deepseek-v3.2",
  "x-ai/grok-4.1",
  "meta-llama/llama-4-maverick",
  "qwen/qwen3-max",
  "mistralai/mistral-large-2512",
];

export const GROUPS: Group[] = [
  {
    id: "texto",
    title: "Texto: artigos, pautas e diagnósticos",
    description: "Quem escreve os artigos, sugere pautas, monta o relatório do diagnóstico e nomeia categorias e etiquetas.",
    fields: [
      {
        key: "ai_provider",
        label: "Provedor",
        hint: "Automático usa o OpenRouter quando houver chave dele.",
        options: [
          { value: "", label: "Automático" },
          { value: "openrouter", label: "OpenRouter" },
          { value: "anthropic", label: "Anthropic (direto)" },
        ],
      },
      { key: "openrouter_api_key", label: "Chave do OpenRouter", secret: true, placeholder: "sk-or-...", envVar: "OPENROUTER_API_KEY" },
      {
        key: "openrouter_model",
        label: "Modelo padrão do OpenRouter",
        hint: "Formato fornecedor/modelo. Vale para tudo que não tiver modelo próprio abaixo.",
        placeholder: "anthropic/claude-sonnet-5",
        envVar: "OPENROUTER_MODEL",
        suggestions: MODEL_SUGGESTIONS,
      },
      {
        key: "model_artigo",
        label: "Modelo dos artigos",
        hint: "Texto longo com pesquisa e checklist. Use um modelo forte.",
        placeholder: "usa o padrão",
        suggestions: MODEL_SUGGESTIONS,
      },
      { key: "model_pautas", label: "Modelo das pautas", placeholder: "usa o padrão", suggestions: MODEL_SUGGESTIONS },
      { key: "model_diagnostico", label: "Modelo do diagnóstico", placeholder: "usa o padrão", suggestions: MODEL_SUGGESTIONS },
      {
        key: "model_pesquisa",
        label: "Modelo da pesquisa na web",
        hint: "Busca as fontes dos artigos. O plugin de busca do OpenRouter é cobrado à parte.",
        placeholder: "usa o padrão",
        suggestions: MODEL_SUGGESTIONS,
      },
      {
        key: "model_apoio",
        label: "Modelo de apoio",
        hint: "Tarefas curtas: títulos, categorias, etiquetas, blocos de GEO e o prompt das capas. Um modelo barato resolve.",
        placeholder: "usa o padrão",
        suggestions: MODEL_SUGGESTIONS,
      },
      { key: "anthropic_api_key", label: "Chave da Anthropic", secret: true, placeholder: "sk-ant-...", hint: "Usada só quando o provedor é Anthropic." },
      { key: "anthropic_model", label: "Modelo da Anthropic", placeholder: "claude-sonnet-5" },
    ],
  },
  {
    id: "imagens",
    title: "Imagens",
    description: "Capas dos artigos e imagens da biblioteca de Mídia.",
    fields: [
      { key: "gemini_api_key", label: "Chave do Gemini", secret: true, placeholder: "AIza...", envVar: "GEMINI_API_KEY" },
      {
        key: "gemini_image_model",
        label: "Modelo padrão",
        placeholder: "gemini-3-pro-image",
        envVar: "GEMINI_IMAGE_MODEL",
        options: [
          { value: "", label: "Padrão (Pro)" },
          { value: "gemini-3-pro-image", label: "gemini-3-pro-image (Pro)" },
          { value: "gemini-3.1-flash-image", label: "gemini-3.1-flash-image (Flash)" },
          { value: "gemini-3.1-flash-lite-image", label: "gemini-3.1-flash-lite-image (Flash Lite)" },
        ],
      },
    ],
  },
  {
    id: "seo",
    title: "SEO e diagnóstico",
    description: "Notas do PageSpeed e busca do perfil no Google Empresas.",
    fields: [{ key: "google_api_key", label: "Chave do Google Cloud", secret: true, placeholder: "AIza...", envVar: "GOOGLE_API_KEY" }],
  },
  {
    id: "google",
    title: "Google Empresas",
    description: "Login com o Google (OAuth) para gerir os perfis dos clientes: publicações, avaliações e desempenho.",
    note: "O Google precisa aprovar o acesso da OutBox à Business Profile API. Até lá, a conexão funciona mas as chamadas voltam com cota zero.",
    fields: [
      { key: "google_oauth_client_id", label: "Client ID do OAuth", placeholder: "123...apps.googleusercontent.com" },
      { key: "google_oauth_client_secret", label: "Client secret do OAuth", secret: true, placeholder: "GOCSPX-..." },
    ],
  },
  {
    id: "telegram",
    title: "Telegram",
    description: "Bot que leva o rascunho para o cliente aprovar.",
    fields: [
      { key: "telegram_bot_token", label: "Token do bot", secret: true, placeholder: "123456:ABC...", envVar: "TELEGRAM_BOT_TOKEN" },
      { key: "telegram_bot_username", label: "Usuário do bot", hint: "Sem @. Em branco, o CMS pergunta ao Telegram.", envVar: "TELEGRAM_BOT_USERNAME" },
      { key: "telegram_webhook_secret", label: "Segredo do webhook", secret: true, envVar: "TELEGRAM_WEBHOOK_SECRET" },
    ],
  },
  {
    id: "video",
    title: "Vídeo",
    description: "Reservado para a geração de vídeos.",
    note: "Os campos já ficam salvos aqui, mas nenhuma função do CMS usa vídeo ainda.",
    fields: [
      { key: "video_api_key", label: "Chave de API", secret: true },
      { key: "video_model", label: "Modelo", placeholder: "ex.: veo-3" },
    ],
  },
];

export const FIELDS: Field[] = GROUPS.flatMap((g) => g.fields);
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

// ---------------------------------------------------------------- cifra

const PREFIX = "enc:v1:";

function cipherKey(): Buffer {
  // a chave de service role já é o segredo mais forte do servidor; nunca sai daqui
  return createHash("sha256").update(`outbox-settings:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

function decrypt(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored; // valor antigo, em texto puro
  const [iv, tag, data] = stored.slice(PREFIX.length).split(".");
  try {
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- leitura

type State = { values: Record<string, string>; at: number; loading: Promise<void> | null };
const g = globalThis as typeof globalThis & { __outboxSettings?: State };
const state: State = (g.__outboxSettings ??= { values: {}, at: 0, loading: null });
const TTL_MS = 30_000;

async function importFromEnv(existing: Record<string, string>): Promise<Record<string, string>> {
  // Chaves de texto da Anthropic ficam de fora: a troca para o OpenRouter é feita à mão no painel.
  const rows = FIELDS.filter((f) => f.envVar && !existing[f.key] && process.env[f.envVar]?.trim()).map((f) => ({
    key: f.key,
    value: encrypt(process.env[f.envVar!]!.trim()),
  }));
  if (!rows.length) return existing;
  const { error } = await db().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("[settings] importação das variáveis do servidor falhou:", error.message);
    return existing;
  }
  const merged = { ...existing };
  for (const f of FIELDS) if (f.envVar && !merged[f.key] && process.env[f.envVar]?.trim()) merged[f.key] = process.env[f.envVar]!.trim();
  console.log(`[settings] ${rows.length} chave(s) do servidor importada(s) para o painel`);
  return merged;
}

async function fetchAll(): Promise<void> {
  let data: { key: string; value: string | null }[] | null = null;
  try {
    const res = await db().from("app_settings").select("key, value");
    if (res.error) throw new Error(res.error.message);
    data = res.data as { key: string; value: string | null }[];
  } catch (err) {
    // sem banco (build, ambiente sem variáveis): segue só com as variáveis do servidor
    console.error("[settings] não foi possível ler as configurações:", err instanceof Error ? err.message : err);
    state.at = Date.now();
    return;
  }
  const values: Record<string, string> = {};
  for (const row of data ?? []) {
    if (!row.value) continue;
    const plain = decrypt(row.value);
    if (plain) values[row.key] = plain;
  }
  try {
    state.values = await importFromEnv(values);
  } catch {
    state.values = values;
  }
  state.at = Date.now();
  setSnapshot(state.values);
}

/** Garante que o espelho em memória está atualizado (cache de 30 s). */
export async function loadSettings(force = false): Promise<Record<string, string>> {
  if (!force && state.at && Date.now() - state.at < TTL_MS) return state.values;
  state.loading ??= fetchAll().finally(() => {
    state.loading = null;
  });
  await state.loading;
  return state.values;
}

/** Valores para a tela: segredos viram máscara, o resto vem inteiro. */
export async function settingsForPanel(): Promise<Record<string, { value: string; masked: boolean; fromEnv: boolean }>> {
  const values = await loadSettings(true);
  const out: Record<string, { value: string; masked: boolean; fromEnv: boolean }> = {};
  for (const f of FIELDS) {
    const v = values[f.key] ?? "";
    const fromEnv = Boolean(f.envVar && !v && process.env[f.envVar]?.trim());
    out[f.key] = f.secret
      ? { value: v ? `••••••••${v.slice(-4)}` : "", masked: Boolean(v), fromEnv }
      : { value: v, masked: false, fromEnv };
  }
  return out;
}

/** Grava um valor interno (fora do formulário), como o token de acesso do Google. */
export async function writeInternal(key: string, value: string | null, secret = true): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ key, value: value === null ? null : secret ? encrypt(value) : value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
  await loadSettings(true);
}

/** Salva o que mudou. Campo secreto com string vazia fica como está; "apagar" remove. */
export async function writeSettings(values: Record<string, string>, userId: string): Promise<void> {
  const rows: { key: string; value: string | null; updated_by: string; updated_at: string }[] = [];
  const now = new Date().toISOString();
  for (const [key, raw] of Object.entries(values)) {
    const field = BY_KEY.get(key);
    if (!field) continue;
    const value = raw.trim();
    if (field.secret && !value) continue; // não mexe no segredo já guardado
    const remove = value === "apagar" || (!field.secret && !value);
    rows.push({ key, value: remove ? null : field.secret ? encrypt(value) : value, updated_by: userId, updated_at: now });
  }
  if (!rows.length) return;
  const { error } = await db().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
  await loadSettings(true);
}

export { snapshotValues };
