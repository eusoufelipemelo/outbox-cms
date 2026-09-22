import { pick } from "./settings-store";

// Chaves e modelos vêm do Painel administrativo (banco); as variáveis do servidor ficam como reserva.
// Variáveis lidas em tempo de execução (não no build), para a mesma imagem Docker
// servir qualquer ambiente configurado no Easypanel.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** URL pública do CMS, usada em snippets de integração e no embed. */
  get appUrl() {
    return (process.env.APP_URL || "https://cms.outboxgroup.com.br").replace(/\/$/, "");
  },
  /** Opcional: habilita o assistente de escrita com IA. */
  /** Modelo usado quando o provedor é a Anthropic direto. */
  get anthropicModel() {
    return pick("anthropic_model", process.env.AI_MODEL);
  },
  get anthropicApiKey() {
    return pick("anthropic_api_key", process.env.ANTHROPIC_API_KEY);
  },
  /** Opcional: usa o OpenRouter (um só painel de créditos para vários modelos) em vez da Anthropic. */
  get openrouterApiKey() {
    return pick("openrouter_api_key", process.env.OPENROUTER_API_KEY);
  },
  /** Modelo do OpenRouter (ex.: "anthropic/claude-sonnet-5", "openai/gpt-5.1", "google/gemini-3-pro"). */
  get openrouterModel() {
    return pick("openrouter_model", process.env.OPENROUTER_MODEL || process.env.AI_MODEL) || "anthropic/claude-sonnet-5";
  },
  /** Força um provedor de texto: "openrouter" ou "anthropic". Vazio = o que tiver chave. */
  get aiProvider() {
    const v = pick("ai_provider", process.env.AI_PROVIDER)?.toLowerCase();
    return v === "openrouter" || v === "anthropic" ? v : null;
  },
  /** Opcional: protege o endpoint de agendamento chamado por cron externo. */
  get cronSecret() {
    return process.env.CRON_SECRET || null;
  },
  /**
   * Opcional: domínios de e-mail aprovados automaticamente no primeiro login
   * (ex.: "outboxgroup.com.br,outbox.com.br"). Contas de outros domínios esperam um admin.
   */
  get autoApproveDomains(): string[] {
    return (process.env.AUTO_APPROVE_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
  },
  /** Só para desenvolvimento: 1 libera entregas para localhost/rede interna (bloqueadas por padrão). */
  get allowPrivateUrls() {
    return process.env.OUTBOX_ALLOW_PRIVATE_URLS === "1";
  },
  /**
   * Opcional: Cloudflare R2 para as imagens. Com as 5 variáveis preenchidas, os uploads vão
   * para o R2; sem elas, continuam no Supabase Storage.
   */
  get r2() {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.R2_BUCKET?.trim();
    const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
    return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
  },
  /** Opcional: geração de imagens com o Gemini (Nano Banana). */
  get geminiApiKey() {
    return pick("gemini_api_key", process.env.GEMINI_API_KEY);
  },
  get geminiImageModel() {
    return pick("gemini_image_model", process.env.GEMINI_IMAGE_MODEL) || "gemini-3-pro-image"; // Nano Banana Pro
  },
  /** Opcional: chave do Google Cloud para o Diagnóstico (PageSpeed Insights API + Places API). */
  get googleApiKey() {
    return pick("google_api_key", process.env.GOOGLE_API_KEY);
  },
  /** Opcional: bot do Telegram que manda o rascunho para o cliente aprovar. */
  get telegramBotToken() {
    return pick("telegram_bot_token", process.env.TELEGRAM_BOT_TOKEN);
  },
  /** Nome do bot (sem @), usado no link de conexão t.me/<bot>?start=codigo. */
  get telegramBotUsername() {
    return pick("telegram_bot_username", process.env.TELEGRAM_BOT_USERNAME)?.replace(/^@/, "") || null;
  },
  /** Segredo conferido no webhook do Telegram (cabeçalho x-telegram-bot-api-secret-token). */
  get telegramWebhookSecret() {
    return pick("telegram_webhook_secret", process.env.TELEGRAM_WEBHOOK_SECRET);
  },
};
