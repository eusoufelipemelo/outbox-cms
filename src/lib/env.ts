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
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || null;
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
    return process.env.GEMINI_API_KEY?.trim() || null;
  },
  get geminiImageModel() {
    return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image"; // Nano Banana Pro
  },
  /** Opcional: chave do Google Cloud para o Diagnóstico (PageSpeed Insights API + Places API). */
  get googleApiKey() {
    return process.env.GOOGLE_API_KEY?.trim() || null;
  },
};
