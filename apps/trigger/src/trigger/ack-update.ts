import type { AckUpdateJob } from "@crm/core";
import { prisma } from "@crm/db";
import { logger, task } from "@trigger.dev/sdk/v3";

export const processAckUpdate = task({
  id: "process-ack-update",
  retry: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2 },
  run: async (payload: AckUpdateJob) => {
    const { ack, webhookEventId } = payload;

    const atualizada = await prisma.message.updateMany({
      where: { externalId: ack.externalId },
      data: {
        status: ack.status,
        ...(ack.status === "ENTREGUE" ? { deliveredAt: ack.timestamp } : {}),
        ...(ack.status === "LIDO" ? { readAt: ack.timestamp } : {}),
      },
    });

    if (atualizada.count === 0) {
      logger.info("ack sem mensagem correspondente", { externalId: ack.externalId });
    }

    await prisma.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } });
  },
});
