import { prisma } from "@crm/db";

/**
 * Mesmo resolvedor usado em apps/api/src/org.ts e apps/worker/src/org.ts:
 * a organização é sempre a dona da sessão WAHA configurada, nunca um valor
 * fixo. Repetido aqui (não importado dali) porque apps/web não depende do
 * pacote onde os outros vivem — juntar os três num pacote compartilhado é
 * um follow-up razoável, não feito agora para não arriscar os dois lados
 * que já estão validados.
 */
export async function resolverOrganizacaoPorSessao(session: string) {
  const integracao = await prisma.integration.findFirst({
    where: { provider: "WAHA", config: { path: ["session"], equals: session } },
    select: { organizationId: true },
  });
  if (!integracao) return null;
  return prisma.organization.findUnique({ where: { id: integracao.organizationId } });
}
