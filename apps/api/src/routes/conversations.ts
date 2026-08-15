import { canRespond, ConversationLockedError, type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { waha } from "../integrations/waha.js";
import { exigirPerfil } from "../plugins/auth.js";
import { publicar } from "../realtime/bus.js";

const idParam = z.object({ id: z.string().uuid() });

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", exigirPerfil());

  // ── Listagem (inbox) ────────────────────────────────────────────────────
  app.get("/conversations", async (request) => {
    const q = z
      .object({
        estado: z.string().optional(),
        // Sem estado explícito, a inbox mostra só o que exige ação. Atendimento
        // encerrado é histórico, não fila de trabalho.
        incluirFinalizados: z.coerce.boolean().default(false),
        filaId: z.string().uuid().optional(),
        responsavelId: z.string().uuid().optional(),
        naoLidas: z.coerce.boolean().optional(),
        busca: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(30),
      })
      .parse(request.query);

    const usuario = request.usuario!;

    const conversas = await prisma.conversation.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(q.estado
          ? { state: q.estado as ConversationState }
          : q.incluirFinalizados
            ? {}
            : { state: { not: "FINALIZADO" as ConversationState } }),
        ...(q.filaId ? { queueId: q.filaId } : {}),
        ...(q.responsavelId ? { assigneeId: q.responsavelId } : {}),
        ...(q.naoLidas ? { unreadCount: { gt: 0 } } : {}),
        ...(q.busca
          ? {
              OR: [
                { protocol: { contains: q.busca.replace("#", ""), mode: "insensitive" as const } },
                { contact: { name: { contains: q.busca, mode: "insensitive" as const } } },
                { contact: { phone: { contains: q.busca } } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      take: q.limit,
      include: {
        contact: { select: { id: true, name: true, phone: true, waChatId: true } },
        assignee: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true, color: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorType: true, createdAt: true } },
      },
    });

    return conversas.map((c) => ({
      id: c.id,
      protocolo: c.protocol,
      contato: { id: c.contact.id, nome: c.contact.name, telefone: c.contact.phone },
      estado: c.state,
      etapa: c.funnelStage,
      fila: c.queue,
      responsavel: c.assignee,
      naoLidas: c.unreadCount,
      // Quem responde agora — o indicador visual da inbox.
      controlePor: controleAtual(c.state as ConversationState, c.assignee?.name),
      previa: c.messages[0]?.body?.slice(0, 90) ?? null,
      ultimaMensagem: c.lastMessageAt,
    }));
  });

  // ── Detalhe ─────────────────────────────────────────────────────────────
  app.get("/conversations/:id", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const c = await prisma.conversation.findFirst({
      where: { id, organizationId: request.usuario!.organizationId },
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        assignee: { select: { id: true, name: true } },
        queue: true,
        handoff: true,
      },
    });
    if (!c) return reply.code(404).send({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } });

    // Atendimentos anteriores do mesmo contato. É o que evita a leitura de
    // "conversas repetidas": são tickets distintos da mesma pessoa.
    const anteriores = await prisma.conversation.findMany({
      where: { contactId: c.contactId, id: { not: c.id } },
      orderBy: { openedAt: "desc" },
      take: 10,
      select: { id: true, protocol: true, state: true, openedAt: true, closedAt: true, closeReason: true },
    });

    return {
      id: c.id,
      protocolo: c.protocol,
      estado: c.state,
      etapa: c.funnelStage,
      fila: c.queue ? { id: c.queue.id, nome: c.queue.name, cor: c.queue.color } : null,
      responsavel: c.assignee,
      controlePor: controleAtual(c.state as ConversationState, c.assignee?.name),
      podeResponder: canRespond("ATENDENTE", c.state as ConversationState).allowed,
      handoff: c.handoff,
      anteriores: anteriores.map((a) => ({
        id: a.id,
        protocolo: a.protocol,
        estado: a.state,
        abertoEm: a.openedAt,
        fechadoEm: a.closedAt,
        motivo: a.closeReason,
      })),
      contato: {
        id: c.contact.id,
        nome: c.contact.name,
        telefone: c.contact.phone,
        email: c.contact.email,
        origem: c.contact.source,
        tamanho: c.contact.sizePreference,
        estilo: c.contact.style,
        observacoes: c.contact.internalNotes,
        etiquetas: c.contact.tags.map((t) => ({ nome: t.tag.name, cor: t.tag.color })),
        totalGasto: c.contact.totalSpent,
        pedidos: c.contact.orderCount,
        ticketMedio: c.contact.avgTicket,
        ultimaCompra: c.contact.lastPurchaseAt,
      },
    };
  });

  app.get("/conversations/:id/messages", async (request) => {
    const { id } = idParam.parse(request.params);
    const mensagens = await prisma.message.findMany({
      where: { conversationId: id, conversation: { organizationId: request.usuario!.organizationId } },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { author: { select: { name: true } } },
    });
    return mensagens.map((m) => ({
      id: m.id,
      quem: m.authorType,
      autor: m.author?.name ?? null,
      direcao: m.direction,
      tipo: m.type,
      texto: m.body,
      midia: m.mediaUrl,
      status: m.status,
      erro: m.errorMessage,
      em: m.createdAt,
    }));
  });

  // ── Envio manual ────────────────────────────────────────────────────────
  app.post("/conversations/:id/messages", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const corpo = z.object({ texto: z.string().min(1).max(4096) }).safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({ error: { code: "DADOS_INVALIDOS", message: "Texto obrigatório." } });
    }

    const usuario = request.usuario!;
    const conversa = await prisma.conversation.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: { contact: { select: { waChatId: true } } },
    });
    if (!conversa) return reply.code(404).send({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } });

    // Mesma política que trava bot e IA — vale para o atendente também.
    const decisao = canRespond("ATENDENTE", conversa.state as ConversationState);
    if (!decisao.allowed) {
      return reply.code(409).send({ error: { code: "CONVERSA_BLOQUEADA", message: decisao.reason } });
    }

    try {
      const enviado = await waha.sendText({ chatId: conversa.contact.waChatId, text: corpo.data.texto });
      const mensagem = await prisma.message.create({
        data: {
          organizationId: usuario.organizationId,
          conversationId: id,
          externalId: enviado.externalId,
          direction: "OUTBOUND",
          authorType: "ATENDENTE",
          authorUserId: usuario.id,
          type: "TEXT",
          body: corpo.data.texto,
          status: "ENVIADO",
          sentAt: enviado.timestamp,
        },
      });

      await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          // Primeira resposta humana marca o SLA.
          ...(conversa.firstReplyAt ? {} : { firstReplyAt: new Date() }),
        },
      });

      publicar({ tipo: "message.created", conversationId: id, dados: { id: mensagem.id, quem: "ATENDENTE", texto: corpo.data.texto } });
      return reply.send({ id: mensagem.id, status: "ENVIADO" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // A falha entra no histórico: o atendente precisa ver que não foi.
      await prisma.message.create({
        data: {
          organizationId: usuario.organizationId,
          conversationId: id,
          direction: "OUTBOUND",
          authorType: "ATENDENTE",
          authorUserId: usuario.id,
          type: "TEXT",
          body: corpo.data.texto,
          status: "FALHA",
          errorMessage: msg.slice(0, 1000),
        },
      });
      return reply.code(502).send({ error: { code: "FALHA_ENVIO", message: msg } });
    }
  });

  // ── Ações do atendente ──────────────────────────────────────────────────
  app.post("/conversations/:id/assume", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const usuario = request.usuario!;

    // Transação: assumir e pausar a automação são o mesmo ato. Se ficassem
    // separados, existiria um instante em que a conversa tem dono e o bot
    // ainda pode responder.
    const conversa = await prisma.$transaction(async (tx) => {
      const atual = await tx.conversation.findFirst({ where: { id, organizationId: usuario.organizationId } });
      if (!atual) return null;
      if (atual.state === "FINALIZADO") throw new ConversationLockedError("Conversa finalizada. Reabra antes de assumir.");

      const atualizada = await tx.conversation.update({
        where: { id },
        data: {
          assigneeId: usuario.id,
          state: "ATENDIMENTO_HUMANO",
          funnelStage: "EM_ATENDIMENTO",
          unreadCount: 0,
        },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          type: "assigned",
          fromValue: atual.state,
          toValue: "ATENDIMENTO_HUMANO",
          actorType: "usuario",
          actorId: usuario.id,
          reason: "assumiu o atendimento",
        },
      });
      return atualizada;
    });

    if (!conversa) return reply.code(404).send({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } });

    // Avisa o cliente que saiu do automático e tem uma pessoa do outro lado.
    // Sem isso, quem estava conversando com o bot não percebe a troca e fica
    // esperando uma resposta que já está a caminho.
    const contato = await prisma.contact.findUnique({
      where: { id: conversa.contactId },
      select: { waChatId: true },
    });
    if (contato) {
      const aviso = `Oi! Aqui é ${primeiroNome(usuario.name)}, da RISE. Assumi seu atendimento e já vou te responder. 😊`;
      try {
        const enviado = await waha.sendText({ chatId: contato.waChatId, text: aviso });
        await prisma.message.create({
          data: {
            organizationId: usuario.organizationId,
            conversationId: id,
            externalId: enviado.externalId,
            direction: "OUTBOUND",
            authorType: "ATENDENTE",
            authorUserId: usuario.id,
            type: "TEXT",
            body: aviso,
            status: "ENVIADO",
            sentAt: enviado.timestamp,
          },
        });
      } catch (error) {
        // Assumir não pode falhar porque o aviso não saiu: a conversa já é
        // do atendente. A falha fica registrada no histórico.
        request.log.error({ err: error, conversationId: id }, "falha ao avisar o cliente");
        await prisma.message.create({
          data: {
            organizationId: usuario.organizationId,
            conversationId: id,
            direction: "OUTBOUND",
            authorType: "ATENDENTE",
            authorUserId: usuario.id,
            type: "TEXT",
            body: aviso,
            status: "FALHA",
            errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          },
        });
      }
    }

    publicar({ tipo: "conversation.assigned", conversationId: id, dados: { responsavel: usuario.name } });
    return reply.send({ estado: conversa.state, responsavel: usuario.name });
  });

  app.post("/conversations/:id/transfer", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const corpo = z
      .object({ filaId: z.string().uuid().optional(), usuarioId: z.string().uuid().optional(), motivo: z.string().min(3) })
      .safeParse(request.body);
    if (!corpo.success || (!corpo.data.filaId && !corpo.data.usuarioId)) {
      return reply.code(400).send({ error: { code: "DADOS_INVALIDOS", message: "Informe fila ou usuário de destino, e o motivo." } });
    }

    const paraFila = Boolean(corpo.data.filaId);
    const conversa = await prisma.conversation.update({
      where: { id },
      data: {
        ...(corpo.data.filaId ? { queueId: corpo.data.filaId } : {}),
        assigneeId: corpo.data.usuarioId ?? null,
        state: paraFila ? "AGUARDANDO_ATENDENTE" : "ATENDIMENTO_HUMANO",
        funnelStage: paraFila ? "AGUARDANDO_ATENDENTE" : "EM_ATENDIMENTO",
        queuedAt: paraFila ? new Date() : null,
      },
    });

    await prisma.conversationEvent.create({
      data: {
        conversationId: id,
        type: "transferred",
        toValue: corpo.data.filaId ?? corpo.data.usuarioId ?? null,
        actorType: "usuario",
        actorId: request.usuario!.id,
        reason: corpo.data.motivo,
      },
    });

    publicar({ tipo: "conversation.updated", conversationId: id, dados: { estado: conversa.state } });
    return reply.send({ estado: conversa.state });
  });

  app.post("/conversations/:id/wait-customer", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    await prisma.conversation.update({ where: { id }, data: { state: "AGUARDANDO_CLIENTE" } });
    await registrarEvento(id, "state_changed", "AGUARDANDO_CLIENTE", request.usuario!.id, "aguardando resposta do cliente");
    publicar({ tipo: "conversation.updated", conversationId: id, dados: { estado: "AGUARDANDO_CLIENTE" } });
    return reply.send({ estado: "AGUARDANDO_CLIENTE" });
  });

  app.post("/conversations/:id/return-to-bot", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    await prisma.conversation.update({
      where: { id },
      data: { state: "BOT", assigneeId: null, funnelStage: "TRIAGEM_AUTOMATICA" },
    });
    await registrarEvento(id, "state_changed", "BOT", request.usuario!.id, "devolvida para a automação");
    publicar({ tipo: "conversation.updated", conversationId: id, dados: { estado: "BOT" } });
    return reply.send({ estado: "BOT" });
  });

  app.post("/conversations/:id/close", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const corpo = z.object({ motivo: z.string().min(3).default("resolvido") }).parse(request.body ?? {});
    await prisma.conversation.update({
      where: { id },
      data: { state: "FINALIZADO", funnelStage: "FINALIZADO", closedAt: new Date(), closeReason: corpo.motivo, unreadCount: 0 },
    });
    await registrarEvento(id, "closed", "FINALIZADO", request.usuario!.id, corpo.motivo);
    publicar({ tipo: "conversation.updated", conversationId: id, dados: { estado: "FINALIZADO" } });
    return reply.send({ estado: "FINALIZADO" });
  });

  app.post("/conversations/:id/read", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    return reply.send({ ok: true });
  });

  app.post("/conversations/:id/notes", async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const corpo = z.object({ texto: z.string().min(1) }).safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: { code: "DADOS_INVALIDOS", message: "Texto obrigatório." } });

    const conversa = await prisma.conversation.findUnique({ where: { id }, select: { contactId: true } });
    const nota = await prisma.note.create({
      data: {
        conversationId: id,
        contactId: conversa?.contactId ?? null,
        authorId: request.usuario!.id,
        body: corpo.data.texto,
      },
    });
    return reply.send({ id: nota.id });
  });
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

function controleAtual(estado: ConversationState, responsavel?: string): string {
  switch (estado) {
    case "BOT":
      return "Bot";
    case "IA":
      return "IA";
    case "AGUARDANDO_ATENDENTE":
      return "Na fila";
    case "ATENDIMENTO_HUMANO":
      return responsavel ?? "Atendente";
    case "AGUARDANDO_CLIENTE":
      return "Aguardando cliente";
    case "FINALIZADO":
      return "Finalizado";
  }
}

async function registrarEvento(
  conversationId: string,
  tipo: string,
  para: string,
  usuarioId: string,
  motivo: string,
): Promise<void> {
  await prisma.conversationEvent.create({
    data: { conversationId, type: tipo, toValue: para, actorType: "usuario", actorId: usuarioId, reason: motivo },
  });
}
