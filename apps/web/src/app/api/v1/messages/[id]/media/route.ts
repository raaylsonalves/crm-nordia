import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { usuarioAtual } from "@/lib/session";

/**
 * Equivalente a apps/api/src/routes/conversations.ts (GET /messages/:id/media)
 * — faltava nesta variante.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const mensagem = await prisma.message.findFirst({
    where: { id, organizationId: usuario.organizationId },
    select: { mediaUrl: true, mediaMimeType: true },
  });
  if (!mensagem?.mediaUrl) {
    return NextResponse.json({ error: { code: "SEM_MIDIA", message: "Mensagem sem mídia." } }, { status: 404 });
  }

  try {
    const conteudo = await storage.ler(mensagem.mediaUrl);
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": mensagem.mediaMimeType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: { code: "FALHA_MIDIA", message: msg } }, { status: 502 });
  }
}
