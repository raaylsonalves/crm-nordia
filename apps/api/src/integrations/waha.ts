import { WahaAdapter } from "@crm/adapters";
import { prisma } from "@crm/db";
import { env } from "../env.js";

/**
 * Instância única do adapter. Toda tentativa de chamada — inclusive as que
 * falham — vira linha em integration_log, sem vazar a chave de API.
 */
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
          organizationId: ORG_ID_CACHE ?? "desconhecida",
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
      .catch(() => {
        /* log de integração nunca derruba a operação principal */
      });
  },
});

/** Preenchido na subida — evita uma consulta por linha de log. */
let ORG_ID_CACHE: string | null = null;
export function setOrgIdForLogs(id: string): void {
  ORG_ID_CACHE = id;
}
