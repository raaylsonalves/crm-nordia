import IORedis from "ioredis";
import { env } from "./env.js";

/**
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ nas conexões que ele
 * usa — sem isso, comandos de bloqueio (usados internamente para esperar por
 * jobs) falham após poucas tentativas.
 */
export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
