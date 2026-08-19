import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

/** Equivalente a apps/api/src/routes/conversations.ts (POST /:id/return-to-bot) — faltava nesta variante. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const atualizada = await prisma.conversation.updateMany({
    where: { id, organizationId: usuario.organizationId },
    data: { state: "BOT", assigneeId: null, funnelStage: "TRIAGEM_AUTOMATICA" },
  });
  if (atualizada.count === 0) {
    return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });
  }

  await prisma.conversationEvent.create({
    data: {
      conversationId: id,
      type: "state_changed",
      toValue: "BOT",
      actorType: "usuario",
      actorId: usuario.id,
      reason: "devolvida para a automação",
    },
  });

  return NextResponse.json({ estado: "BOT" });
}
