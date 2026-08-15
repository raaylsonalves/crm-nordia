import { eventId, parseAck, parseInboundMessage, verifySignature, type WahaWebhookBody } from "@crm/adapters";
import { prisma } from "@crm/db";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { processarMensagemRecebida } from "../services/inbound.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/waha", async (request, reply) => {
    const body = request.body as WahaWebhookBody;
    const raw = (request as { rawBody?: string }).rawBody ?? JSON.stringify(body);

    // 1. Autenticação do webhook.
    const assinatura = request.headers["x-waha-signature"] as string | undefined;
    const token = request.headers["x-webhook-token"] as string | undefined;

    let assinaturaOk = false;
    if (env.WAHA_WEBHOOK_HMAC_SECRET) {
      assinaturaOk = verifySignature(raw, assinatura, env.WAHA_WEBHOOK_HMAC_SECRET);
      if (!assinaturaOk) {
        request.log.warn("webhook WAHA com assinatura inválida");
        return reply.code(401).send({ error: { code: "WEBHOOK_SIGNATURE_INVALID", message: "Assinatura inválida." } });
      }
    } else if (env.WAHA_WEBHOOK_TOKEN) {
      if (token !== env.WAHA_WEBHOOK_TOKEN) {
        return reply.code(401).send({ error: { code: "WEBHOOK_TOKEN_INVALID", message: "Token inválido." } });
      }
      assinaturaOk = true;
    } else if (env.NODE_ENV === "production") {
      // Em produção, webhook aberto não passa.
      request.log.error("webhook sem HMAC nem token configurado");
      return reply.code(503).send({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook sem autenticação configurada." } });
    }

    // 2. Mensagem do próprio número é ignorada — senão o bot conversa sozinho.
    const inbound = parseInboundMessage(body);
    if (inbound?.fromMe) {
      return reply.code(200).send({ status: "ignorado", motivo: "fromMe" });
    }

    // 3. Idempotência ANTES de qualquer efeito colateral.
    const externalId = eventId(body);
    if (!externalId) {
      return reply.code(200).send({ status: "ignorado", motivo: "evento sem identificador" });
    }

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "WAHA",
          externalId,
          eventType: body.event ?? "desconhecido",
          signatureOk: assinaturaOk,
          payload: body as object,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        request.log.info({ externalId }, "evento já processado");
        return reply.code(200).send({ status: "duplicado" });
      }
      throw error;
    }

    // 4. Resposta imediata; o processamento segue depois.
    void reply.code(200).send({ status: "recebido" });

    // 5. Processamento.
    try {
      if (inbound) {
        await processarMensagemRecebida(inbound, request.log);
      } else {
        const ack = parseAck(body);
        if (ack) {
          await prisma.message.updateMany({
            where: { externalId: ack.externalId },
            data: {
              status: ack.status,
              ...(ack.status === "ENTREGUE" ? { deliveredAt: ack.timestamp } : {}),
              ...(ack.status === "LIDO" ? { readAt: ack.timestamp } : {}),
            },
          });
        }
      }
      await prisma.webhookEvent.update({
        where: { provider_externalId: { provider: "WAHA", externalId } },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      request.log.error({ err: error, externalId }, "falha ao processar webhook");
      await prisma.webhookEvent.update({
        where: { provider_externalId: { provider: "WAHA", externalId } },
        data: { error: mensagem.slice(0, 1000) },
      });
    }

    return reply;
  });
}
