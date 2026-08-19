import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

/** Equivalente a apps/api/src/routes/conversations.ts (POST /:id/wait-customer) — faltava nesta variante. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const atualizada = await prisma.conversation.updateMany({
    where: { id, organizationId: usuario.organizationId },
    data: { state: "AGUARDANDO_CLIENTE" },
  });
  if (atualizada.count === 0) {
    return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });
  }

  await prisma.conversationEvent.create({
    data: {
      conversationId: id,
      type: "state_changed",
      toValue: "AGUARDANDO_CLIENTE",
      actorType: "usuario",
      actorId: usuario.id,
      reason: "aguardando resposta do cliente",
    },
  });

  return NextResponse.json({ estado: "AGUARDANDO_CLIENTE" });
}
