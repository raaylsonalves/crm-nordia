import type { FastifyReply } from "fastify";

/**
 * Barramento de eventos em tempo real (SSE).
 *
 * Em memória, como as sessões: serve uma instância da API. Ao escalar, o
 * `publicar` passa a escrever num canal Redis e cada instância reemite para
 * seus próprios inscritos — o resto do código não muda.
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

interface Inscrito {
  id: string;
  usuarioId: string;
  reply: FastifyReply;
}

const inscritos = new Map<string, Inscrito>();

export function inscrever(usuarioId: string, reply: FastifyReply): string {
  const id = `${usuarioId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  inscritos.set(id, { id, usuarioId, reply });
  return id;
}

export function desinscrever(id: string): void {
  inscritos.delete(id);
}

export function totalInscritos(): number {
  return inscritos.size;
}

/**
 * Envia o evento a todos os conectados.
 *
 * Sem filtro por fila ainda: com um atendente, todo mundo que está logado
 * precisa ver tudo. Quando houver equipe, filtrar aqui por participação na
 * fila da conversa — o atendente não deve receber evento de conversa que não
 * pode abrir.
 */
export function publicar(evento: Evento): void {
  const payload = `event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`;
  for (const inscrito of inscritos.values()) {
    try {
      inscrito.reply.raw.write(payload);
    } catch {
      // Conexão morta: remove e segue. Uma falha de escrita não pode
      // interromper a entrega aos demais.
      inscritos.delete(inscrito.id);
    }
  }
}
