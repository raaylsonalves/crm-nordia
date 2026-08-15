import { WahaAdapter } from "@crm/adapters";
import { prisma } from "@crm/db";
import { env } from "../env.js";
import { logger } from "../logger.js";

let orgIdParaLogs: string | null = null;
export function setOrgIdForLogs(id: string): void {
  orgIdParaLogs = id;
}

export const waha = new WahaAdapter({
  mode: env.INTEGRATION_MODE,
  baseUrl: env.WAHA_BASE_URL,
  apiKey: env.WAHA_API_KEY,
  session: env.WAHA_SESSION,
  timeoutMs: env.WAHA_TIMEOUT_MS,
  maxRetries: env.WAHA_MAX_RETRIES,
  onLog: (entry) => {
    void prisma.integrationLog
      .create({
        data: {
          organizationId: orgIdParaLogs ?? "desconhecida",
          provider: "WAHA",
          direction: "outbound",
          operation: entry.operation,
          requestSummary: { method: entry.method, path: entry.path },
          statusCode: entry.statusCode ?? null,
          success: entry.success,
          errorMessage: entry.errorMessage?.slice(0, 1000) ?? null,
          durationMs: entry.durationMs,
          attempt: entry.attempt,
        },
      })
      .catch((error) => logger.error({ err: error }, "falha ao gravar integration_log"));
  },
});
