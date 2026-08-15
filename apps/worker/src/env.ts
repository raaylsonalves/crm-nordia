import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  INTEGRATION_MODE: z.enum(["live", "sandbox", "disabled"]).default("disabled"),
  STORE_NAME: z.string().default("RISE"),
  INACTIVITY_WINDOW_MINUTES: z.coerce.number().default(360),

  WAHA_BASE_URL: z.string().url().default("http://localhost:3001"),
  WAHA_API_KEY: z.string().default(""),
  WAHA_SESSION: z.string().default("default"),
  WAHA_TIMEOUT_MS: z.coerce.number().default(15_000),
  WAHA_MAX_RETRIES: z.coerce.number().default(3),

  STORAGE_ENDPOINT: z.string().url().default("http://localhost:9000"),
  STORAGE_BUCKET: z.string().default("crm-rise-media"),
  STORAGE_ACCESS_KEY: z.string().default("crmminio"),
  STORAGE_SECRET_KEY: z.string().default("crmminio123"),
  STORAGE_REGION: z.string().default("us-east-1"),

  // Jobs simultâneos por fila. Baixo de propósito: o gargalo real é a WAHA
  // (uma sessão, um número), não a CPU do worker.
  WORKER_CONCURRENCY: z.coerce.number().default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas no worker:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

if (env.INTEGRATION_MODE === "live" && !env.WAHA_API_KEY) {
  console.error("INTEGRATION_MODE=live exige WAHA_API_KEY preenchida.");
  process.exit(1);
}
