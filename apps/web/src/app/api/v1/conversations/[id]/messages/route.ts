import { canRespond, type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "@/lib/session";
import { waha } from "@/lib/waha";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const mensagens = await prisma.message.findMany({
    where: { conversationId: id, conversation: { organizationId: usuario.organizationId } },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json(
    mensagens.map((m) => ({
      id: m.id,
      quem: m.authorType,
      autor: m.author?.name ?? null,
      direcao: m.direction,
      tipo: m.type,
      texto: m.body,
      temMidia: m.mediaUrl !== null,
      status: m.status,
      erro: m.errorMessage,
      em: m.createdAt,
    })),
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const corpo = z.object({ texto: z.string().min(1).max(4096) }).safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json({ error: { code: "DADOS_INVALIDOS", message: "Texto obrigatório." } }, { status: 400 });
  }

  const conversa = await prisma.conversation.findFirst({
    where: { id, organizationId: usuario.organizationId },
    include: { contact: { select: { waChatId: true } } },
  });
  if (!conversa) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

  const decisao = canRespond("ATENDENTE", conversa.state as ConversationState);
  if (!decisao.allowed) {
    return NextResponse.json({ error: { code: "CONVERSA_BLOQUEADA", message: decisao.reason } }, { status: 409 });
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
      data: { lastMessageAt: new Date(), ...(conversa.firstReplyAt ? {} : { firstReplyAt: new Date() }) },
    });

    return NextResponse.json({ id: mensagem.id, status: "ENVIADO" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
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
    return NextResponse.json({ error: { code: "FALHA_ENVIO", message: msg } }, { status: 502 });
  }
}
