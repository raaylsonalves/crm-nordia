import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "@/lib/session";

const corpoSchema = z.object({
  filaId: z.string().uuid().optional(),
  usuarioId: z.string().uuid().optional(),
  motivo: z.string().min(3),
});

/** Equivalente a apps/api/src/routes/conversations.ts (POST /:id/transfer) — faltava nesta variante. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success || (!corpo.data.filaId && !corpo.data.usuarioId)) {
    return NextResponse.json(
      { error: { code: "DADOS_INVALIDOS", message: "Informe fila ou usuário de destino, e o motivo." } },
      { status: 400 },
    );
  }

  const atual = await prisma.conversation.findFirst({ where: { id, organizationId: usuario.organizationId } });
  if (!atual) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

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
      actorId: usuario.id,
      reason: corpo.data.motivo,
    },
  });

  return NextResponse.json({ estado: conversa.state });
}
