import { WahaAdapter } from "@crm/adapters";
import { prisma } from "@crm/db";
import { resolverOrganizacaoPorSessao } from "./org.js";

const sessaoConfigurada = process.env.WAHA_SESSION ?? "rise-principal";

/** Cacheado por processo: resolvido uma vez, reaproveitado nas chamadas seguintes. */
let orgIdCache: string | null | undefined;
async function orgIdParaLogs(): Promise<string | null> {
  if (orgIdCache === undefined) {
    const org = await resolverOrganizacaoPorSessao(sessaoConfigurada);
    orgIdCache = org?.id ?? null;
  }
  return orgIdCache;
}

/**
 * Adapter de saída para as rotas do Next.js — envio manual do atendente
 * (Assumir já avisa o cliente; enviar mensagem chama isto).
 *
 * Mesma ressalva já registrada no restante do projeto: uma única sessão
 * fixada por variável de ambiente. Nesta variante de teste, log de
 * integração vai direto para o banco sem a atribuição fina de organização
 * que a API Fastify faz — suficiente para diagnosticar, não é o desenho
 * final quando existir um adapter por organização.
 */
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
        if (!organizationId) return; // sem organização mapeada, não força log incorreto
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
