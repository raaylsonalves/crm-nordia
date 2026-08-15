import { z } from "zod";

/**
 * Validação de ambiente na subida. Se faltar algo essencial, o processo morre
 * agora com mensagem clara — melhor que falhar no primeiro webhook.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3333),
  LOG_LEVEL: z.string().default("info"),

  INTEGRATION_MODE: z.enum(["live", "sandbox", "disabled"]).default("disabled"),

  STORE_NAME: z.string().default("RISE"),
  INACTIVITY_WINDOW_MINUTES: z.coerce.number().default(360),

  WAHA_BASE_URL: z.string().url().default("http://localhost:3001"),
  WAHA_API_KEY: z.string().default(""),
  WAHA_SESSION: z.string().default("default"),
  WAHA_WEBHOOK_TOKEN: z.string().default(""),
  WAHA_WEBHOOK_HMAC_SECRET: z.string().default(""),
  WAHA_TIMEOUT_MS: z.coerce.number().default(15_000),
  WAHA_MAX_RETRIES: z.coerce.number().default(3),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

/** Modo live exige credencial. Sem isso, é melhor falhar do que fingir. */
if (env.INTEGRATION_MODE === "live" && !env.WAHA_API_KEY) {
  console.error("INTEGRATION_MODE=live exige WAHA_API_KEY preenchida.");
  process.exit(1);
}
