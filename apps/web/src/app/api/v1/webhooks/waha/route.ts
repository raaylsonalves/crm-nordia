import { eventId, parseAck, parseInboundMessage, verifySignature, type WahaWebhookBody } from "@crm/adapters";
import { prisma } from "@crm/db";
import { tasks } from "@trigger.dev/sdk/v3";
import { NextResponse } from "next/server";

/**
 * Mesma disciplina do webhook Fastify (apps/api/src/routes/webhooks.ts):
 * autentica, garante idempotência, e só então dispara o processamento —
 * aqui, uma task do Trigger.dev em vez de um job do BullMQ. A troca de
 * "quem processa" não muda nada da parte que garante que nenhuma mensagem
 * seja processada duas vezes.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const body = JSON.parse(raw) as WahaWebhookBody;

  const assinatura = request.headers.get("x-webhook-hmac") ?? undefined;
  const algoritmo = request.headers.get("x-webhook-hmac-algorithm") ?? "sha512";
  const token = request.headers.get("x-webhook-token") ?? undefined;
  const hmacSecret = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  const tokenEsperado = process.env.WAHA_WEBHOOK_TOKEN;

  let assinaturaOk = false;
  if (hmacSecret) {
    assinaturaOk = verifySignature(raw, assinatura, hmacSecret, algoritmo);
    if (!assinaturaOk) {
      return NextResponse.json({ error: { code: "WEBHOOK_SIGNATURE_INVALID", message: "Assinatura inválida." } }, { status: 401 });
    }
  } else if (tokenEsperado) {
    if (token !== tokenEsperado) {
      return NextResponse.json({ error: { code: "WEBHOOK_TOKEN_INVALID", message: "Token inválido." } }, { status: 401 });
    }
    assinaturaOk = true;
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook sem autenticação configurada." } }, { status: 503 });
  }

  const inbound = parseInboundMessage(body);
  if (inbound?.fromMe) {
    return NextResponse.json({ status: "ignorado", motivo: "fromMe" });
  }

  const externalId = eventId(body);
  if (!externalId) {
    return NextResponse.json({ status: "ignorado", motivo: "evento sem identificador" });
  }

  let webhookEventId: string;
  try {
    const evento = await prisma.webhookEvent.create({
      data: {
        provider: "WAHA",
        externalId,
        eventType: body.event ?? "desconhecido",
        signatureOk: assinaturaOk,
        payload: body as object,
      },
    });
    webhookEventId = evento.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ status: "duplicado" });
    }
    throw error;
  }

  if (inbound) {
    await tasks.trigger("process-inbound-message", { webhookEventId, message: inbound }, { idempotencyKey: externalId });
  } else {
    const ack = parseAck(body);
    if (ack) {
      await tasks.trigger("process-ack-update", { webhookEventId, ack }, { idempotencyKey: externalId });
    } else {
      await prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } });
    }
  }

  return NextResponse.json({ status: "recebido" });
}
