import { canRespond, type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { waha } from "../integrations/waha.js";

/**
 * Rotas de inspeção para testar o fluxo antes da UI existir.
 * Sem autenticação de propósito — por isso só são registradas fora de produção.
 */
export async function devRoutes(app: FastifyInstance): Promise<void> {
  // Estado das integrações. Nunca devolve segredo.
  app.get("/integrations/waha/session", async () => {
    try {
      const status = await waha.getSessionStatus();
      return { mode: waha.mode, ...status };
    } catch (error) {
      return {
        mode: waha.mode,
        connected: false,
        erro: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Inbox em texto puro.
  app.get("/conversations", async (request) => {
    const query = z.object({ state: z.string().optional(), limit: z.coerce.number().max(100).default(20) }).parse(request.query);

    const conversas = await prisma.conversation.findMany({
      where: query.state ? { state: query.state as ConversationState } : {},
      orderBy: { lastMessageAt: "desc" },
      take: query.limit,
      include: {
        contact: { select: { name: true, phone: true } },
        assignee: { select: { name: true } },
        queue: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    });

    return conversas.map((c) => ({
      id: c.id,
      protocolo: c.protocol,
      contato: c.contact.name,
      telefone: c.contact.phone,
      estado: c.state,
      etapa: c.funnelStage,
      fila: c.queue?.name ?? null,
      responsavel: c.assignee?.name ?? null,
      mensagens: c._count.messages,
      naoLidas: c.unreadCount,
      automacaoPodeResponder: canRespond("BOT", c.state as ConversationState).allowed,
      ultimaMensagem: c.lastMessageAt,
    }));
  });

  app.get("/conversations/:id/messages", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const mensagens = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return mensagens.map((m) => ({
      quem: m.authorType,
      direcao: m.direction,
      texto: m.body,
      status: m.status,
      erro: m.errorMessage,
      em: m.createdAt,
    }));
  });

  // Últimos eventos recebidos — o que a tela de integrações vai mostrar.
  app.get("/integrations/webhook-events", async () => {
    const eventos = await prisma.webhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: { eventType: true, externalId: true, signatureOk: true, processedAt: true, error: true, receivedAt: true },
    });
    return eventos;
  });

  app.get("/integrations/logs", async () => {
    return prisma.integrationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { provider: true, operation: true, success: true, statusCode: true, errorMessage: true, durationMs: true, attempt: true, createdAt: true },
    });
  });
}
