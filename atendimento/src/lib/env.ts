// Leitura centralizada das variáveis de ambiente do servidor.
// As públicas (NEXT_PUBLIC_*) são lidas direto onde usadas, porque o Next
// só as embute no cliente quando aparecem literalmente no código.

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return valor;
}

export type ProvedorIA = "openrouter" | "anthropic";
export type ProvedorWhatsapp = "bridge" | "zapi";

export const env = {
  get supabaseUrl() {
    return obrigatoria("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return obrigatoria("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return obrigatoria("SUPABASE_SERVICE_ROLE_KEY");
  },

  // IA -----------------------------------------------------------------------
  get aiProvider(): ProvedorIA {
    const v = (process.env.AI_PROVIDER || "openrouter").toLowerCase();
    return v === "anthropic" ? "anthropic" : "openrouter";
  },
  /** Modelo do provedor atual. OpenRouter: "anthropic/claude-sonnet-5.5"; Anthropic: "claude-sonnet-5-5". */
  get aiModel(): string {
    if (process.env.AI_MODEL) return process.env.AI_MODEL;
    return this.aiProvider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"
      : "anthropic/claude-sonnet-5.5";
  },
  get openrouterApiKey() {
    return obrigatoria("OPENROUTER_API_KEY");
  },
  get anthropicApiKey() {
    return obrigatoria("ANTHROPIC_API_KEY");
  },

  // WhatsApp -----------------------------------------------------------------
  get whatsappProvider(): ProvedorWhatsapp {
    const v = (process.env.WHATSAPP_PROVIDER || "bridge").toLowerCase();
    return v === "zapi" ? "zapi" : "bridge";
  },
  get zapiInstanceId() {
    return obrigatoria("ZAPI_INSTANCE_ID");
  },
  get zapiToken() {
    return obrigatoria("ZAPI_TOKEN");
  },
  get zapiClientToken() {
    return obrigatoria("ZAPI_CLIENT_TOKEN");
  },
  get webhookSecret() {
    return obrigatoria("WEBHOOK_SECRET");
  },

  /** URL pública do próprio app, sem barra no fim. */
  get appUrl(): string {
    const explicita = process.env.APP_URL;
    if (explicita) return explicita.replace(/\/$/, "");
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
};

/** Nome do bucket privado de mídia do WhatsApp (ponte). */
export const BUCKET_MIDIA = "ar1-wa-media";
