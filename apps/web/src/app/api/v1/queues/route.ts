import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

/** Equivalente a apps/api/src/routes/conversations.ts (GET /queues) — faltava nesta variante. */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }

  const filas = await prisma.queue.findMany({
    where: { organizationId: usuario.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true, description: true },
  });
  return NextResponse.json(filas);
}
