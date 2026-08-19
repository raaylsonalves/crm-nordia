import { type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "@/lib/session";

function previaDe(mensagem: { body: string | null; type: string } | undefined): string | null {
  if (!mensagem) return null;
  if (mensagem.body?.trim()) return mensagem.body.slice(0, 90);
  const rotulos: Record<string, string> = {
    IMAGE: "📷 Imagem",
    AUDIO: "🎤 Áudio",
    VIDEO: "🎬 Vídeo",
    DOCUMENT: "📎 Documento",
    STICKER: "Figurinha",
    LOCATION: "📍 Localização",
  };
  return rotulos[mensagem.type] ?? null;
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

export async function GET(request: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = z
    .object({
      estado: z.string().optional(),
      incluirFinalizados: z.coerce.boolean().default(false),
      naoLidas: z.coerce.boolean().optional(),
      busca: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(30),
    })
    .parse(Object.fromEntries(url.searchParams));

  const conversas = await prisma.conversation.findMany({
    where: {
      organizationId: usuario.organizationId,
      ...(q.estado
        ? { state: q.estado as ConversationState }
        : q.incluirFinalizados
          ? {}
          : { state: { not: "FINALIZADO" as ConversationState } }),
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
      contact: { select: { id: true, name: true, phone: true } },
      assignee: { select: { id: true, name: true } },
      queue: { select: { id: true, name: true, color: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, type: true } },
    },
  });

  return NextResponse.json(
    conversas.map((c) => ({
      id: c.id,
      protocolo: c.protocol,
      contato: { id: c.contact.id, nome: c.contact.name, telefone: c.contact.phone },
      estado: c.state,
      etapa: c.funnelStage,
      fila: c.queue,
      responsavel: c.assignee,
      naoLidas: c.unreadCount,
      controlePor: controleAtual(c.state as ConversationState, c.assignee?.name),
      previa: previaDe(c.messages[0]),
      ultimaMensagem: c.lastMessageAt,
    })),
  );
}
