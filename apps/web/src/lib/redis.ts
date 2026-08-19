import Redis from "ioredis";

/**
 * Cliente Redis para as rotas de API do Next.js (variante Vercel).
 *
 * Em serverless, o módulo pode ser reavaliado a cada cold start — o cache em
 * `globalThis` evita abrir uma conexão nova a cada invocação enquanto a
 * function estiver "quente", o mesmo problema que o Prisma resolve do
 * mesmo jeito em apps/web (ver comentário equivalente em packages/db).
 */
declare global {
  // eslint-disable-next-line no-var
  var __crmRedis: Redis | undefined;
}

export const redis =
  globalThis.__crmRedis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    // Upstash e provedores gerenciados costumam exigir TLS; sem isso a
    // conexão cai silenciosamente em produção.
    ...(process.env.REDIS_URL?.startsWith("rediss://") ? { tls: {} } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__crmRedis = redis;
}
