import Redis from "ioredis";
import { env } from "./env.js";

/**
 * Conexão Redis compartilhada (sessões hoje; filas BullMQ e fan-out de SSE
 * depois). `lazyConnect` deixa a API subir mesmo se o Redis ainda estiver
 * iniciando — o erro aparece na primeira operação, não no boot.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  retryStrategy: (tentativa) => Math.min(tentativa * 200, 3_000),
});

redis.on("error", (erro) => {
  // Sem console.error direto: o log estruturado da API cuidaria disso, mas
  // este módulo carrega antes do logger. Mantém curto para não poluir.
  if ((erro as NodeJS.ErrnoException).code !== "ECONNREFUSED") return;
});

export async function redisSaudavel(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
