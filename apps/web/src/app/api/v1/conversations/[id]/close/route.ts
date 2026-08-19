import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "@/lib/session";

/** Equivalente a apps/api/src/routes/conversations.ts (POST /:id/close) — faltava nesta variante. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const corpo = z.object({ motivo: z.string().min(3).default("resolvido") }).parse((await request.json().catch(() => ({}))) ?? {});

  const atualizada = await prisma.conversation.updateMany({
    where: { id, organizationId: usuario.organizationId },
    data: { state: "FINALIZADO", funnelStage: "FINALIZADO", closedAt: new Date(), closeReason: corpo.motivo, unreadCount: 0 },
  });
  if (atualizada.count === 0) {
    return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });
  }

  await prisma.conversationEvent.create({
    data: {
      conversationId: id,
      type: "closed",
      toValue: "FINALIZADO",
      actorType: "usuario",
      actorId: usuario.id,
      reason: corpo.motivo,
    },
  });

  return NextResponse.json({ estado: "FINALIZADO" });
}
