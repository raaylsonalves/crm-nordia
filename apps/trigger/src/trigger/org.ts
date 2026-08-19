import { prisma } from "@crm/db";

/** Mesmo resolvedor de apps/api e apps/worker — ver comentário lá sobre a duplicação. */
export async function resolverOrganizacaoPorSessao(session: string) {
  const integracao = await prisma.integration.findFirst({
    where: { provider: "WAHA", config: { path: ["session"], equals: session } },
    select: { organizationId: true },
  });
  if (!integracao) return null;
  return prisma.organization.findUnique({ where: { id: integracao.organizationId } });
}
