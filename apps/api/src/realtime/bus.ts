import { CANAL_REALTIME, type Evento } from "@crm/core";
import type { FastifyReply } from "fastify";
import { redis } from "../redis.js";

/**
 * Barramento de eventos em tempo real (SSE).
 *
 * A entrega ao navegador é local ao processo (Map de conexões abertas), mas a
 * publicação passa pelo Redis: é assim que o worker — rodando num processo
 * separado, sem nenhuma conexão SSE — consegue fazer uma mensagem aparecer na
 * tela do atendente. Também deixa o desenho pronto para mais de uma instância
 * da API no futuro, sem trocar nada aqui.
 */

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

function entregarLocal(evento: Evento): void {
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

// Conexão dedicada: um cliente Redis em modo subscribe não pode executar
// outros comandos, então não pode ser a mesma instância usada pelas sessões.
const assinante = redis.duplicate();
let assinado = false;

export async function iniciarBarramento(): Promise<void> {
  if (assinado) return;
  assinado = true;
  await assinante.subscribe(CANAL_REALTIME);
  assinante.on("message", (_canal, mensagem) => {
    try {
      entregarLocal(JSON.parse(mensagem) as Evento);
    } catch {
      // Mensagem malformada no canal não pode derrubar o processo.
    }
  });
}

export async function pararBarramento(): Promise<void> {
  if (!assinado) return;
  await assinante.quit();
}

/** Publica no canal Redis; a entrega ao navegador acontece em entregarLocal. */
export async function publicar(evento: Evento): Promise<void> {
  await redis.publish(CANAL_REALTIME, JSON.stringify(evento));
}
