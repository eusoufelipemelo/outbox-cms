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
};

export type Group = { id: string; title: string; description: string; fields: Field[]; note?: string };

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
        label: "Modelo do OpenRouter",
        hint: "No formato fornecedor/modelo, como anthropic/claude-sonnet-5.",
        placeholder: "anthropic/claude-sonnet-5",
        envVar: "OPENROUTER_MODEL",
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
  const { data, error } = await db().from("app_settings").select("key, value");
  if (error) {
    console.error("[settings] não foi possível ler as configurações:", error.message);
    return;
  }
  const values: Record<string, string> = {};
  for (const row of (data ?? []) as { key: string; value: string | null }[]) {
    if (!row.value) continue;
    const plain = decrypt(row.value);
    if (plain) values[row.key] = plain;
  }
  state.values = await importFromEnv(values);
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
