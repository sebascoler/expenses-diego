import "server-only";

/**
 * Lectura centralizada de variables de entorno (§16.8).
 * En producción, si faltan los secretos obligatorios la app falla rápido con un mensaje claro.
 * En dev y tests se usan valores derivados fijos (nunca en producción).
 */
const DEV_FALLBACK = "dev-only-insecure-secret-do-not-use-in-production";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SECRETS !== "1";
}

function required(name: "SESSION_SECRET" | "ENCRYPTION_KEY" | "DEDUP_HMAC_KEY"): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProduction()) {
    const msg = `[config] Falta la variable de entorno obligatoria ${name}. Generala con: openssl rand -base64 32`;
    console.error(msg);
    throw new Error(msg);
  }
  return `${DEV_FALLBACK}:${name}`;
}

export const env = {
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get dedupHmacKey() {
    return required("DEDUP_HMAC_KEY");
  },
  get databaseUrl() {
    return process.env.DATABASE_URL?.trim() || undefined;
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY?.trim() || undefined;
  },
  get mailFrom() {
    return process.env.MAIL_FROM?.trim() || "Gastos <onboarding@resend.dev>";
  },
  get cronSecret() {
    return process.env.CRON_SECRET?.trim() || undefined;
  },
  get appUrl() {
    return (process.env.APP_URL?.trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  },
  get bootstrapUsername() {
    return process.env.BOOTSTRAP_USERNAME?.trim() || undefined;
  },
  get bootstrapPassword() {
    return process.env.BOOTSTRAP_PASSWORD || undefined;
  },
  /** "fixture" = tasas fijas de fixtures/fx-rates.json (tests y e2e, sin red). */
  get fxProvider() {
    return process.env.FX_PROVIDER?.trim() || "frankfurter";
  },
};

/** Verifica al arrancar (instrumentation.ts) que los secretos estén en producción. */
export function assertProductionConfig() {
  if (!isProduction()) return;
  void env.sessionSecret;
  void env.encryptionKey;
  void env.dedupHmacKey;
  if (process.env.VERCEL && !env.databaseUrl) {
    const msg = "[config] Falta DATABASE_URL. En Vercel agregá Neon desde Storage → Marketplace.";
    console.error(msg);
    throw new Error(msg);
  }
}
