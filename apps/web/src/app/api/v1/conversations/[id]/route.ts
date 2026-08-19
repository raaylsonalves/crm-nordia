import { canRespond, type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const c = await prisma.conversation.findFirst({
    where: { id, organizationId: usuario.organizationId },
    include: {
      contact: { include: { tags: { include: { tag: true } } } },
      assignee: { select: { id: true, name: true } },
      queue: true,
      handoff: true,
    },
  });
  if (!c) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

  const anteriores = await prisma.conversation.findMany({
    where: { contactId: c.contactId, id: { not: c.id } },
    orderBy: { openedAt: "desc" },
    take: 10,
    select: { id: true, protocol: true, state: true, openedAt: true, closedAt: true, closeReason: true },
  });

  return NextResponse.json({
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
  });
}
