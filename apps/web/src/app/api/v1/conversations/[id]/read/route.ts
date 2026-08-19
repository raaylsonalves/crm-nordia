import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

/**
 * Equivalente a apps/api/src/routes/conversations.ts (POST /:id/read) —
 * faltava nesta variante. O front já chamava esta rota ao abrir uma
 * conversa (ver apps/web/src/app/inbox/page.tsx), mas com .catch(() => {})
 * silencioso: o 404 sumia sem erro visível e o contador de não lidas nunca
 * zerava.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const atualizada = await prisma.conversation.updateMany({
    where: { id, organizationId: usuario.organizationId },
    data: { unreadCount: 0 },
  });
  if (atualizada.count === 0) {
    return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
