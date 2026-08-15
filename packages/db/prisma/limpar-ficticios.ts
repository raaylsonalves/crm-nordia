/**
 * Remove os dados fictícios de desenvolvimento, preservando:
 *   - a organização, usuários, filas, etiquetas e automações (estrutura);
 *   - a base de conhecimento (conteúdo real do site da RISE);
 *   - os contatos e conversas que vieram de verdade pelo WhatsApp.
 *
 * O critério de "real" é a origem `whatsapp`, gravada pelo pipeline de entrada.
 * Contatos do seed têm origem de campanha, botão ou orgânico.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reais = await prisma.contact.findMany({
    where: { source: "whatsapp" },
    select: { id: true, name: true, waChatId: true },
  });

  if (reais.length === 0) {
    console.log("Nenhum contato real encontrado. Abortando para não apagar tudo.");
    return;
  }

  console.log(`Preservando ${reais.length} contato(s) real(is):`);
  for (const c of reais) console.log(`  • ${c.name} (${c.waChatId})`);

  const idsReais = reais.map((c) => c.id);
  const conversasReais = await prisma.conversation.findMany({
    where: { contactId: { in: idsReais } },
    select: { id: true },
  });
  const idsConversasReais = conversasReais.map((c) => c.id);

  const removidos = await prisma.$transaction([
    prisma.note.deleteMany({ where: { conversationId: { notIn: idsConversasReais } } }),
    prisma.handoff.deleteMany({ where: { conversationId: { notIn: idsConversasReais } } }),
    prisma.conversationEvent.deleteMany({ where: { conversationId: { notIn: idsConversasReais } } }),
    prisma.message.deleteMany({ where: { conversationId: { notIn: idsConversasReais } } }),
    prisma.conversation.deleteMany({ where: { contactId: { notIn: idsReais } } }),
    prisma.opportunity.deleteMany({ where: { contactId: { notIn: idsReais } } }),
    prisma.orderItem.deleteMany({}),
    prisma.order.deleteMany({}),
    prisma.consent.deleteMany({ where: { contactId: { notIn: idsReais } } }),
    prisma.contactTag.deleteMany({ where: { contactId: { notIn: idsReais } } }),
    prisma.contact.deleteMany({ where: { id: { notIn: idsReais } } }),
    // Catálogo do seed: as variações eram inventadas e não há integração de
    // loja. Sai inteiro para ninguém confundir com estoque real.
    prisma.productVariant.deleteMany({}),
    prisma.product.deleteMany({}),
  ]);

  const nomes = [
    "notas",
    "handoffs",
    "eventos",
    "mensagens",
    "conversas",
    "oportunidades",
    "itens de pedido",
    "pedidos",
    "consentimentos",
    "etiquetas de contato",
    "contatos",
    "variações",
    "produtos",
  ];

  console.log("\nRemovidos:");
  removidos.forEach((r, i) => {
    if (r.count > 0) console.log(`  ${String(r.count).padStart(4)} ${nomes[i]}`);
  });

  const restam = {
    contatos: await prisma.contact.count(),
    conversas: await prisma.conversation.count(),
    mensagens: await prisma.message.count(),
    usuarios: await prisma.user.count(),
    filas: await prisma.queue.count(),
    conhecimento: await prisma.knowledgeDocument.count(),
    automacoes: await prisma.automation.count(),
  };
  console.log("\nPreservado:", restam);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
