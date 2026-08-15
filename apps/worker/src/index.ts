import { QUEUE_NAMES, type AckUpdateJob, type InboundMessageJob } from "@crm/core";
import { prisma } from "@crm/db";
import { Worker } from "bullmq";
import { env } from "./env.js";
import { setOrgIdForLogs } from "./integrations/waha.js";
import { logger } from "./logger.js";
import { processarAck } from "./processors/ack-update.js";
import { processarMensagemRecebida } from "./processors/inbound-message.js";
import { redis } from "./redis.js";

logger.info(`worker iniciando · integrações em modo ${env.INTEGRATION_MODE.toUpperCase()} · concorrência ${env.WORKER_CONCURRENCY}`);

const org = await prisma.organization.findFirst({ where: { slug: "rise" }, select: { id: true } });
if (org) setOrgIdForLogs(org.id);
else logger.error("organização 'rise' não encontrada — rode pnpm db:seed");

const inboundWorker = new Worker<InboundMessageJob>(
  QUEUE_NAMES.inboundMessage,
  async (job) => {
    const log = logger.child({ fila: job.queueName, jobId: job.id, tentativa: job.attemptsMade + 1 });
    log.info({ externalId: job.data.message.externalId }, "processando mensagem recebida");
    await processarMensagemRecebida(job, log);
  },
  { connection: redis, concurrency: env.WORKER_CONCURRENCY },
);

const ackWorker = new Worker<AckUpdateJob>(
  QUEUE_NAMES.ackUpdate,
  async (job) => {
    const log = logger.child({ fila: job.queueName, jobId: job.id });
    await processarAck(job, log);
  },
  { connection: redis, concurrency: env.WORKER_CONCURRENCY },
);

for (const worker of [inboundWorker, ackWorker]) {
  worker.on("completed", (job) => {
    logger.debug({ fila: worker.name, jobId: job.id }, "job concluído");
  });

  worker.on("failed", (job, error) => {
    // Última tentativa esgotada: fica registrado no log e no próprio job (o
    // BullMQ mantém o histórico de falhas para inspeção manual).
    const esgotado = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.error(
      { fila: worker.name, jobId: job?.id, tentativa: job?.attemptsMade, esgotado, err: error },
      esgotado ? "job falhou definitivamente" : "job falhou, será retentado",
    );
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "erro na conexão do worker");
  });
}

logger.info("worker pronto — aguardando jobs");

async function desligar(sinal: string): Promise<void> {
  logger.info({ sinal }, "encerrando worker…");
  await Promise.all([inboundWorker.close(), ackWorker.close()]);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
}

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => void desligar(sinal));
}
