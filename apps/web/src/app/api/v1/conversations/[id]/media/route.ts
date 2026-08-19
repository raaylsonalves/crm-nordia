import { canRespond, type ConversationState } from "@crm/core";
import { prisma } from "@crm/db";
import { NextResponse } from "next/server";
import { chaveDeMidia, storage } from "@/lib/storage";
import { usuarioAtual } from "@/lib/session";
import { waha } from "@/lib/waha";

/**
 * Equivalente a apps/api/src/routes/conversations.ts (POST /:id/media) —
 * faltava nesta variante. Requer STORAGE_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY
 * configurados (ver apps/web/.env.vercel) — sem isso, falha ao arquivar,
 * mas ainda tenta enviar pela WAHA.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioAtual();
  if (!usuario) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }
  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const arquivo = formData?.get("file");
  if (!formData || !(arquivo instanceof File)) {
    return NextResponse.json({ error: { code: "SEM_ARQUIVO", message: "Envie um arquivo." } }, { status: 400 });
  }
  const legenda = formData.get("caption");
  const legendaTexto = typeof legenda === "string" && legenda.trim() ? legenda.trim() : undefined;

  const conversa = await prisma.conversation.findFirst({
    where: { id, organizationId: usuario.organizationId },
    include: { contact: { select: { waChatId: true } } },
  });
  if (!conversa) return NextResponse.json({ error: { code: "NAO_ENCONTRADA", message: "Conversa não encontrada." } }, { status: 404 });

  const decisao = canRespond("ATENDENTE", conversa.state as ConversationState);
  if (!decisao.allowed) {
    return NextResponse.json({ error: { code: "CONVERSA_BLOQUEADA", message: decisao.reason } }, { status: 409 });
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  const mimeType = arquivo.type || "application/octet-stream";
  const tipo = mimeType.startsWith("image/")
    ? ("IMAGE" as const)
    : mimeType.startsWith("audio/")
      ? ("AUDIO" as const)
      : mimeType.startsWith("video/")
        ? ("VIDEO" as const)
        : ("DOCUMENT" as const);

  try {
    const enviado = await waha.sendMedia({
      chatId: conversa.contact.waChatId,
      base64: conteudo.toString("base64"),
      mimeType,
      filename: arquivo.name,
      ...(legendaTexto ? { caption: legendaTexto } : {}),
    });

    let chave: string | null = null;
    try {
      chave = await storage.guardar(chaveDeMidia(id, enviado.externalId, mimeType), conteudo, mimeType);
    } catch (erroStorage) {
      console.error("[media] mídia enviada mas não arquivada:", erroStorage);
    }

    const mensagem = await prisma.message.create({
      data: {
        organizationId: usuario.organizationId,
        conversationId: id,
        externalId: enviado.externalId,
        direction: "OUTBOUND",
        authorType: "ATENDENTE",
        authorUserId: usuario.id,
        type: tipo,
        body: legendaTexto ?? null,
        mediaUrl: chave,
        mediaMimeType: mimeType,
        mediaSize: conteudo.length,
        status: "ENVIADO",
        sentAt: enviado.timestamp,
      },
    });

    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return NextResponse.json({ id: mensagem.id, tipo, status: "ENVIADO" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.message.create({
      data: {
        organizationId: usuario.organizationId,
        conversationId: id,
        direction: "OUTBOUND",
        authorType: "ATENDENTE",
        authorUserId: usuario.id,
        type: tipo,
        body: legendaTexto ?? arquivo.name,
        mediaMimeType: mimeType,
        status: "FALHA",
        errorMessage: msg.slice(0, 1000),
      },
    });
    return NextResponse.json({ error: { code: "FALHA_ENVIO", message: msg } }, { status: 502 });
  }
}
