import { eventId, parseAck, parseInboundMessage, verifySignature, type WahaWebhookBody } from "@crm/adapters";
import { RETRY_PADRAO } from "@crm/core";
import { prisma } from "@crm/db";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { ackUpdateQueue, inboundMessageQueue } from "../queues.js";

/**
 * Webhook da WAHA.
 *
 * A responsabilidade daqui é só: autenticar, checar idempotência e enfileirar.
 * Nenhum envio, download de mídia ou lógica de bot roda neste handler — isso
 * é trabalho do worker, e é isso que garante que uma mensagem sobreviva a um
 * restart da API no meio do processamento.
 */
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

    // 3. Idempotência ANTES de qualquer efeito colateral — inclusive antes de
    // enfileirar. O unique (provider, externalId) é o que garante que uma
    // reentrega da WAHA nunca vira dois jobs.
    const externalId = eventId(body);
    if (!externalId) {
      return reply.code(200).send({ status: "ignorado", motivo: "evento sem identificador" });
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
        request.log.info({ externalId }, "evento já processado");
        return reply.code(200).send({ status: "duplicado" });
      }
      throw error;
    }

    // 4. Enfileira o trabalho de verdade. jobId = externalId: mesmo que este
    // handler rodasse duas vezes por algum motivo, o BullMQ não duplicaria o job.
    if (inbound) {
      await inboundMessageQueue.add(
        "processar",
        { webhookEventId, message: inbound },
        { ...RETRY_PADRAO, jobId: externalId },
      );
    } else {
      const ack = parseAck(body);
      if (ack) {
        await ackUpdateQueue.add(
          "processar",
          { webhookEventId, ack },
          { ...RETRY_PADRAO, jobId: externalId },
        );
      } else {
        // Evento reconhecido (ex.: session.status) mas sem processamento
        // definido ainda. Marca como tratado para não poluir a fila de erros.
        await prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } });
      }
    }

    return reply.code(200).send({ status: "recebido" });
  });
}
