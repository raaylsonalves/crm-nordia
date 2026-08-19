import { ConversationLockedError } from "@crm/core";
import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";
import { waha } from "@/lib/waha";

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  let conversa;
  try {
    conversa = await prisma.$transaction(async (tx) => {
      const atual = await tx.conversation.findFirst({ where: { id, organizationId: usuario.organizationId } });
      if (!atual) return null;
      if (atual.state === "FINALIZADO") throw new ConversationLockedError("Conversa finalizada. Reabra antes de assumir.");

      const atualizada = await tx.conversation.update({
        where: { id },
        data: { assigneeId: usuario.id, state: "ATENDIMENTO_HUMANO", funnelStage: "EM_ATENDIMENTO", unreadCount: 0 },
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
  } catch (error) {
    if (error instanceof ConversationLockedError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    throw error;
  }

  if (!conversa) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

  const [contato, organizacao] = await Promise.all([
    prisma.contact.findUnique({ where: { id: conversa.contactId }, select: { waChatId: true } }),
    prisma.organization.findUnique({ where: { id: usuario.organizationId }, select: { name: true } }),
  ]);
  if (contato) {
    const aviso = `Oi! Aqui é ${primeiroNome(usuario.name)}, da ${organizacao?.name ?? "equipe"}. Assumi seu atendimento e já vou te responder. 😊`;
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

  return NextResponse.json({ estado: conversa.state, responsavel: usuario.name });
}
