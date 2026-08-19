import { WahaAdapter } from "@crm/adapters";
import { prisma } from "@crm/db";
import { resolverOrganizacaoPorSessao } from "./org.js";

const sessaoConfigurada = process.env.WAHA_SESSION ?? "rise-principal";

let orgIdCache: string | null | undefined;
async function orgIdParaLogs(): Promise<string | null> {
  if (orgIdCache === undefined) {
    const org = await resolverOrganizacaoPorSessao(sessaoConfigurada);
    orgIdCache = org?.id ?? null;
  }
  return orgIdCache;
}

export const waha = new WahaAdapter({
  mode: (process.env.INTEGRATION_MODE as "live" | "sandbox" | "disabled") ?? "disabled",
  baseUrl: process.env.WAHA_BASE_URL ?? "http://localhost:3001",
  apiKey: process.env.WAHA_API_KEY ?? "",
  session: sessaoConfigurada,
  timeoutMs: Number(process.env.WAHA_TIMEOUT_MS ?? 15_000),
  maxRetries: Number(process.env.WAHA_MAX_RETRIES ?? 3),
  onLog: (entry) => {
    void orgIdParaLogs()
      .then((organizationId) => {
        if (!organizationId) return;
        return prisma.integrationLog.create({
          data: {
            organizationId,
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
        });
      })
      .catch(() => {});
  },
});
