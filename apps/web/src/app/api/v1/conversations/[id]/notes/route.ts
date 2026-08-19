import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "@/lib/session";

/** Equivalente a apps/api/src/routes/conversations.ts (POST /:id/notes) — faltava nesta variante. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const corpo = z.object({ texto: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: { code: "DADOS_INVALIDOS", message: "Texto obrigatório." } }, { status: 400 });
  }

  const conversa = await prisma.conversation.findFirst({
    where: { id, organizationId: usuario.organizationId },
    select: { contactId: true },
  });
  if (!conversa) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

  const nota = await prisma.note.create({
    data: { conversationId: id, contactId: conversa.contactId, authorId: usuario.id, body: corpo.data.texto },
  });

  return NextResponse.json({ id: nota.id });
}
