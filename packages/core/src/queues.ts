import type { AckEvent, InboundMessage } from "./ports/whatsapp.js";

/**
 * Nomes das filas BullMQ e o formato dos jobs — compartilhados entre quem
 * enfileira (API, no webhook) e quem processa (worker). Sem isso os dois
 * lados podem divergir silenciosamente sobre o nome da fila ou o formato do
 * payload, e o job simplesmente nunca seria pego.
 */
export const QUEUE_NAMES = {
  inboundMessage: "inbound-message",
  ackUpdate: "ack-update",
} as const;

export interface InboundMessageJob {
  webhookEventId: string;
  message: InboundMessage;
}

export interface AckUpdateJob {
  webhookEventId: string;
  ack: AckEvent;
}

/** Opções padrão de retentativa: 5 tentativas com recuo exponencial. */
export const RETRY_PADRAO = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2_000 },
};
