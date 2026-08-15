/**
 * Contrato de tempo real compartilhado entre API e worker.
 *
 * Puramente tipos e constantes — sem I/O. A API entrega eventos por SSE; o
 * worker só publica. Os dois lados precisam concordar no nome do canal e no
 * formato do evento, e é isso que este arquivo fixa. Cada processo mantém
 * sua própria conexão Redis; nenhuma delas mora aqui.
 */

export type EventoTipo =
  | "message.created"
  | "message.status"
  | "conversation.updated"
  | "conversation.assigned";

export interface Evento {
  tipo: EventoTipo;
  conversationId: string;
  dados: unknown;
}

/** Canal Redis Pub/Sub usado para propagar eventos entre processos. */
export const CANAL_REALTIME = "crm:realtime";
