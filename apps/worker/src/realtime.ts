import { CANAL_REALTIME, type Evento } from "@crm/core";
import { redis } from "./redis.js";

/**
 * O worker não tem conexão SSE nenhuma — só publica no canal Redis. Quem
 * entrega ao navegador é a API, que assina o mesmo canal (`apps/api/src/realtime/bus.ts`).
 */
export async function publicar(evento: Evento): Promise<void> {
  await redis.publish(CANAL_REALTIME, JSON.stringify(evento));
}
