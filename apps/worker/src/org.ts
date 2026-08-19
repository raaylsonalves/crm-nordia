import { prisma } from "@crm/db";

/**
 * Resolve a organização dona da sessão WAHA que entregou o evento.
 *
 * Cada organização tem seu próprio número de WhatsApp e sua própria sessão
 * na WAHA — nunca cai para uma organização padrão quando a sessão não é
 * reconhecida. Sem essa checagem, um erro de configuração faria uma
 * mensagem da NORDIA (ou de qualquer organização futura) ser processada
 * como se fosse da RISE, misturando contatos e conversas de empresas
 * diferentes no mesmo lugar.
 */
export async function resolverOrganizacaoPorSessao(session: string) {
  const integracao = await prisma.integration.findFirst({
    where: {
      provider: "WAHA",
      config: { path: ["session"], equals: session },
    },
    select: { organizationId: true },
  });
  if (!integracao) return null;
  return prisma.organization.findUnique({ where: { id: integracao.organizationId } });
}
