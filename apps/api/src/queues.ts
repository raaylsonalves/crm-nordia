import { QUEUE_NAMES } from "@crm/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env.js";

/**
 * Conexão dedicada às filas: BullMQ exige `maxRetriesPerRequest: null` nas
 * conexões que usa (ele mesmo controla as retentativas de comando). Por isso
 * não reaproveitamos a conexão de sessões, que tem sua própria política.
 */
const conexaoFila = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const inboundMessageQueue = new Queue(QUEUE_NAMES.inboundMessage, { connection: conexaoFila });
export const ackUpdateQueue = new Queue(QUEUE_NAMES.ackUpdate, { connection: conexaoFila });

export async function fecharFilas(): Promise<void> {
  await Promise.all([inboundMessageQueue.close(), ackUpdateQueue.close()]);
  await conexaoFila.quit();
}
