import type { AckUpdateJob } from "@crm/core";
import { prisma } from "@crm/db";
import type { Job } from "bullmq";
import type { Logger } from "pino";
import { publicar } from "../realtime.js";

/** Atualiza o status de entrega (enviado/entregue/lido) de uma mensagem já enviada. */
export async function processarAck(job: Job<AckUpdateJob>, log: Logger): Promise<void> {
  const { ack, webhookEventId } = job.data;

  const atualizada = await prisma.message.updateMany({
    where: { externalId: ack.externalId },
    data: {
      status: ack.status,
      ...(ack.status === "ENTREGUE" ? { deliveredAt: ack.timestamp } : {}),
      ...(ack.status === "LIDO" ? { readAt: ack.timestamp } : {}),
    },
  });

  if (atualizada.count > 0) {
    const mensagem = await prisma.message.findFirst({
      where: { externalId: ack.externalId },
      select: { conversationId: true },
    });
    if (mensagem) {
      await publicar({
        tipo: "message.status",
        conversationId: mensagem.conversationId,
        dados: { externalId: ack.externalId, status: ack.status },
      });
    }
  } else {
    // Não é erro: o ack pode chegar antes de a mensagem existir localmente
    // em cenários de corrida, ou ser de uma sessão anterior ao seed.
    log.info({ externalId: ack.externalId }, "ack sem mensagem correspondente");
  }

  await prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } });
}
