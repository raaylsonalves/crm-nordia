import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";

export async function GET() {
  const u = await usuarioAtual();
  if (!u) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }

  const filas = await prisma.queueMember.findMany({
    where: { userId: u.id },
    include: { queue: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json({
    id: u.id,
    nome: u.name,
    email: u.email,
    perfil: u.role,
    filas: filas.map((f) => f.queue),
  });
}
