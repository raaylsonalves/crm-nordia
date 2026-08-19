import { prisma } from "@crm/db";

/**
 * Resolve qual organização é dona de uma sessão WAHA.
 *
 * Usado apenas para atribuir os logs de integração do adapter de saída
 * (`waha`, singleton do processo) à organização certa — hoje esse adapter é
 * uma única instância fixada pela sessão em `WAHA_SESSION`, então "a
 * organização dona da sessão configurada" é a resposta correta até existir
 * um adapter por organização. Espelha `apps/worker/src/org.ts`.
 */
export async function resolverOrganizacaoPorSessao(session: string) {
  const integracao = await prisma.integration.findFirst({
    where: { provider: "WAHA", config: { path: ["session"], equals: session } },
    select: { organizationId: true },
  });
  if (!integracao) return null;
  return prisma.organization.findUnique({ where: { id: integracao.organizationId } });
}
