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
};
