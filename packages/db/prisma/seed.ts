/**
 * Seed de desenvolvimento — RISE (userisefit.com.br).
 *
 * DADOS REAIS: identidade da marca, políticas de troca e entrega, contato,
 * nomes e preços de produtos — todos extraídos do site público em 15/08/2026.
 *
 * DADOS FICTÍCIOS (desenvolvimento): usuários da equipe, contatos, pedidos,
 * conversas, variações de tamanho/cor e estoque. Estão marcados como tal.
 *
 * As integrações ficam em modo DISABLED — nada aqui simula WAHA ou IA
 * funcionando. Nuvemshop está fora do escopo por ora.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ConsentChannel,
  ConversationState,
  FunnelStage,
  IndexStatus,
  IntegrationMode,
  IntegrationProvider,
  KbSourceType,
  MessageAuthorType,
  MessageDirection,
  MessageStatus,
  MessageType,
  OrderStatus,
  Prisma,
  PrismaClient,
  UserRole,
  UserStatus,
} from "@prisma/client";
import {
  CATEGORIAS,
  CONTATOS,
  GRADE_PROVISORIA,
  PRODUTOS,
  VARIACOES_SAO_REAIS,
} from "./seed/catalogo.js";
import { DOCUMENTOS } from "./seed/conhecimento.js";

const prisma = new PrismaClient();

// ── utilidades determinísticas ────────────────────────────────────────────
// Gerador com semente fixa: o seed produz sempre o mesmo resultado, o que
// torna capturas de tela e testes manuais reproduzíveis.
let semente = 20260815;
function rand(): number {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
}
const inteiro = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(rand() * lista.length)]!;
const chance = (p: number) => rand() < p;
const diasAtras = (d: number, horas = 0) =>
  new Date(Date.now() - d * 86_400_000 - horas * 3_600_000);
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

/** Protocolo no formato #A7K2-4821, como aparece na conversa com a cliente. */
function gerarProtocolo(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "0123456789";
  const bloco = (fonte: string, n: number) =>
    Array.from({ length: n }, () => fonte[inteiro(0, fonte.length - 1)]).join("");
  return `${bloco(letras, 1)}${bloco(digitos, 1)}${bloco(letras, 1)}${bloco(digitos, 1)}-${bloco(digitos, 4)}`;
}

const SLUG = "rise";

async function limpar() {
  // Ordem importa: filhos antes dos pais.
  await prisma.$transaction([
    prisma.automationRun.deleteMany(),
    prisma.automation.deleteMany(),
    prisma.aiInteraction.deleteMany(),
    prisma.knowledgeChunk.deleteMany(),
    prisma.knowledgeDocument.deleteMany(),
    prisma.integrationLog.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.note.deleteMany(),
    prisma.handoff.deleteMany(),
    prisma.conversationEvent.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.contactTag.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.queueMember.deleteMany(),
    prisma.queue.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
}

async function main() {
  console.log("Limpando dados anteriores…");
  await limpar();

  // ── Organização ─────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: "RISE",
      slug: SLUG,
      timezone: "America/Fortaleza",
      settings: {
        storeName: "RISE",
        siteUrl: "https://userisefit.com.br",
        inactivityWindowMinutes: 360,
        slaFirstReplyMinutes: 5,
        // Dados reais do site (páginas Contato e Política de Entrega).
        supportEmail: "userisefit@outlook.com",
        supportPhone: "5585988163043",
        address: "Rua Odorico de Morais, 250 — Jacarecanga, Fortaleza/CE",
        businessHours: "Segunda a sexta, 08h às 18h (exceto feriados)",
        pickupHours: "Segunda a sexta, 13h às 18h",
      },
    },
  });

  // ── Usuários ────────────────────────────────────────────────────────────
  // Senha única em desenvolvimento. Trocar antes de qualquer ambiente real.
  const senha = await bcrypt.hash("crm@2026", 10);
  // Equipe fictícia de desenvolvimento — substituir pelos usuários reais da RISE.
  const equipe = [
    { name: "Renata Maciel", email: "renata.maciel@userisefit.com.br", role: UserRole.ADMINISTRADOR, status: UserStatus.DISPONIVEL },
    { name: "Paulo Sarmento", email: "paulo.sarmento@userisefit.com.br", role: UserRole.SUPERVISOR, status: UserStatus.DISPONIVEL },
    { name: "Ana Beatriz Ramos", email: "ana.ramos@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.DISPONIVEL },
    { name: "Thiago Barbosa", email: "thiago.barbosa@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.DISPONIVEL },
    { name: "Luana Ferreira", email: "luana.ferreira@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.OCUPADO },
    { name: "Márcio Teixeira", email: "marcio.teixeira@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.AUSENTE },
    { name: "Carla Nunes", email: "carla.nunes@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.OFFLINE },
    { name: "Diego Almeida", email: "diego.almeida@userisefit.com.br", role: UserRole.ATENDENTE, status: UserStatus.DISPONIVEL },
  ];

  const usuarios = [];
  for (const u of equipe) {
    usuarios.push(
      await prisma.user.create({
        data: {
          organizationId: org.id,
          name: u.name,
          email: u.email,
          passwordHash: senha,
          role: u.role,
          status: u.status,
          maxConcurrent: u.role === UserRole.ATENDENTE ? 6 : 12,
          lastSeenAt: u.status === UserStatus.OFFLINE ? diasAtras(1) : new Date(),
        },
      }),
    );
  }
  const atendentes = usuarios.filter((u) => u.role === UserRole.ATENDENTE);

  // ── Filas ───────────────────────────────────────────────────────────────
  const filasSeed = [
    { name: "Vendas", description: "Dúvidas de produto, tamanho e intenção de compra", color: "#B4654A", isDefault: true, slaFirstReplyM: 3 },
    { name: "Pós-venda", description: "Status de pedido, entrega e rastreamento", color: "#5B7B7A", isDefault: false, slaFirstReplyM: 5 },
    { name: "Trocas e devoluções", description: "Solicitações de troca, devolução e defeito", color: "#7A6A8A", isDefault: false, slaFirstReplyM: 10 },
  ];

  const filas = [];
  for (const f of filasSeed) {
    filas.push(
      await prisma.queue.create({
        data: {
          organizationId: org.id,
          ...f,
          slaResolutionM: 60,
          businessHours: {
            seg_sex: { inicio: "09:00", fim: "18:00" },
            sab: { inicio: "09:00", fim: "13:00" },
            dom: null,
          },
        },
      }),
    );
  }
  const [filaVendas, filaPosVenda, filaTrocas] = filas as [
    (typeof filas)[number],
    (typeof filas)[number],
    (typeof filas)[number],
  ];

  // Distribui a equipe: todos em Vendas, metade nas demais.
  for (const [i, atendente] of atendentes.entries()) {
    await prisma.queueMember.create({ data: { queueId: filaVendas.id, userId: atendente.id } });
    if (i % 2 === 0) await prisma.queueMember.create({ data: { queueId: filaPosVenda.id, userId: atendente.id } });
    if (i % 3 === 0) await prisma.queueMember.create({ data: { queueId: filaTrocas.id, userId: atendente.id } });
  }
  for (const gestor of usuarios.filter((u) => u.role !== UserRole.ATENDENTE)) {
    for (const fila of filas) {
      await prisma.queueMember.create({ data: { queueId: fila.id, userId: gestor.id } });
    }
  }

  // ── Etiquetas ───────────────────────────────────────────────────────────
  const etiquetasSeed = [
    { name: "VIP", color: "#B4654A" },
    { name: "Primeira compra", color: "#5B7B7A" },
    { name: "Aguardando reposição", color: "#C08A3E" },
    { name: "Troca em andamento", color: "#7A6A8A" },
    { name: "Atacado", color: "#4A6B8A" },
    { name: "Reclamação", color: "#A64B4B" },
  ];
  const etiquetas = [];
  for (const t of etiquetasSeed) {
    etiquetas.push(await prisma.tag.create({ data: { organizationId: org.id, ...t } }));
  }

  // ── Catálogo ────────────────────────────────────────────────────────────
  console.log("Criando catálogo…");
  let variacoesCriadas = 0;
  const variacoesPorProduto: { produtoNome: string; id: string; sku: string; tamanho: string; cor: string; preco: number }[] = [];

  for (const [i, p] of PRODUTOS.entries()) {
    // Sem integração de catálogo por enquanto: identificador local.
    const externalId = `local-prod-${1000 + i}`;
    const handle = p.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const produto = await prisma.product.create({
      data: {
        organizationId: org.id,
        nuvemshopId: externalId,
        name: p.nome,
        handle,
        description: p.colecao
          ? `Peça da coleção ${p.colecao}. Linha ${p.genero}.`
          : `Linha ${p.genero}.`,
        categories: [p.categoria],
        brand: "RISE",
        published: true,
        canonicalUrl: `https://userisefit.com.br/produtos/${handle}`,
        images: [],
        syncedAt: new Date(),
      },
    });

    for (const cor of p.cores) {
      for (const tamanho of GRADE_PROVISORIA) {
        // Estoque de desenvolvimento. Produto esgotado no site fica zerado em
        // toda a grade — o resto é aleatório e NÃO reflete o estoque real.
        const estoque = p.esgotado ? 0 : chance(0.15) ? 0 : inteiro(1, 12);
        const sku = `RISE-${String(i + 1).padStart(3, "0")}-${tamanho}-${cor.slice(0, 3).toUpperCase()}`;

        const variante = await prisma.productVariant.create({
          data: {
            productId: produto.id,
            nuvemshopId: `local-var-${randomUUID().slice(0, 8)}`,
            sku,
            size: tamanho,
            color: cor,
            price: dec(p.preco),
            promoPrice: null,
            stock: estoque,
            stockManaged: true,
            weightGrams: inteiro(150, 450),
            syncedAt: new Date(),
          },
        });
        variacoesCriadas++;
        variacoesPorProduto.push({
          produtoNome: p.nome,
          id: variante.id,
          sku,
          tamanho,
          cor,
          preco: p.preco,
        });
      }
    }
  }

  // ── Contatos, consentimentos, pedidos ───────────────────────────────────
  console.log("Criando contatos e pedidos…");
  const origens = ["botao_produto", "campanha_instagram", "organico", "indicacao", "google"];
  const contatosCriados = [];
  let pedidosCriados = 0;

  for (const [i, c] of CONTATOS.entries()) {
    const contato = await prisma.contact.create({
      data: {
        organizationId: org.id,
        waChatId: `${c.telefone}@c.us`,
        phone: c.telefone,
        name: c.nome,
        email: c.email,
        source: escolher(origens),
        sizePreference: c.tamanho,
        style: c.estilo,
        interests: [escolher(CATEGORIAS), escolher(CATEGORIAS)].filter(
          (v, idx, arr) => arr.indexOf(v) === idx,
        ),
        nuvemshopId: null, // sem integração de e-commerce por enquanto
        assigneeId: chance(0.5) ? escolher(atendentes).id : null,
        lastContactAt: diasAtras(inteiro(0, 45)),
        internalNotes: chance(0.25)
          ? "Prefere ser chamada no fim da tarde. Costuma pedir foto da peça no corpo antes de fechar."
          : null,
      },
    });

    await prisma.consent.create({
      data: {
        contactId: contato.id,
        channel: ConsentChannel.WHATSAPP_TRANSACIONAL,
        granted: true,
        basis: "execucao_contrato",
        evidence: "Cliente iniciou a conversa pelo botão de WhatsApp da loja.",
        createdAt: diasAtras(inteiro(30, 200)),
      },
    });
    if (chance(0.6)) {
      await prisma.consent.create({
        data: {
          contactId: contato.id,
          channel: ConsentChannel.WHATSAPP_MARKETING,
          granted: chance(0.75),
          basis: "consentimento",
          evidence: "Respondeu SIM ao aceite de novidades e lançamentos.",
          createdAt: diasAtras(inteiro(10, 180)),
        },
      });
    }

    // Etiquetas
    const qtdEtiquetas = inteiro(0, 2);
    const usadas = new Set<string>();
    for (let t = 0; t < qtdEtiquetas; t++) {
      const etiqueta = escolher(etiquetas);
      if (usadas.has(etiqueta.id)) continue;
      usadas.add(etiqueta.id);
      await prisma.contactTag.create({ data: { contactId: contato.id, tagId: etiqueta.id } });
    }

    // Pedidos (0 a 5 por contato)
    const qtdPedidos = chance(0.2) ? 0 : inteiro(1, 5);
    let totalGasto = 0;
    let ultimaCompra: Date | null = null;

    for (let p = 0; p < qtdPedidos; p++) {
      const diasDesde = inteiro(1, 400);
      const feitoEm = diasAtras(diasDesde);
      const itens = Array.from({ length: inteiro(1, 3) }, () => {
        const v = escolher(variacoesPorProduto);
        return { variacao: v, quantidade: chance(0.85) ? 1 : 2 };
      });
      const subtotal = itens.reduce((s, it) => s + it.variacao.preco * it.quantidade, 0);
      // A RISE não publica regra de frete grátis nem de cupom — nada disso é
      // simulado aqui. Frete é apenas um valor de desenvolvimento.
      const frete = inteiro(18, 45);
      const cupom = null;
      const total = subtotal + frete;

      // Status coerente com a idade do pedido.
      const status: OrderStatus =
        diasDesde > 20
          ? chance(0.06)
            ? OrderStatus.DEVOLVIDO
            : OrderStatus.ENTREGUE
          : diasDesde > 8
            ? OrderStatus.ENTREGUE
            : diasDesde > 4
              ? OrderStatus.ENVIADO
              : diasDesde > 1
                ? OrderStatus.PAGO
                : chance(0.25)
                  ? OrderStatus.CANCELADO
                  : OrderStatus.ABERTO;

      const pago = status !== OrderStatus.ABERTO && status !== OrderStatus.CANCELADO;
      const enviado = pago && status !== OrderStatus.PAGO;
      const entregue = status === OrderStatus.ENTREGUE || status === OrderStatus.DEVOLVIDO;

      const pedido = await prisma.order.create({
        data: {
          organizationId: org.id,
          nuvemshopId: `local-ped-${10_000 + pedidosCriados}`,
          contactId: contato.id,
          number: String(1000 + pedidosCriados),
          status,
          paymentStatus: pago ? "pago" : status === OrderStatus.CANCELADO ? "cancelado" : "pendente",
          shippingStatus: entregue ? "entregue" : enviado ? "em_transito" : "aguardando",
          total: dec(total),
          currency: "BRL",
          couponCode: cupom,
          trackingCode: enviado ? `BR${inteiro(100_000_000, 999_999_999)}BR` : null,
          trackingUrl: enviado ? "https://rastreamento.correios.com.br" : null,
          customerEmail: c.email,
          customerPhone: c.telefone,
          placedAt: feitoEm,
          paidAt: pago ? new Date(feitoEm.getTime() + 3_600_000) : null,
          shippedAt: enviado ? new Date(feitoEm.getTime() + 2 * 86_400_000) : null,
          deliveredAt: entregue ? new Date(feitoEm.getTime() + 6 * 86_400_000) : null,
          raw: { origem: "seed", observacao: "Dados fictícios de desenvolvimento" },
          syncedAt: new Date(),
          items: {
            create: itens.map((it) => ({
              productName: it.variacao.produtoNome,
              sku: it.variacao.sku,
              size: it.variacao.tamanho,
              color: it.variacao.cor,
              quantity: it.quantidade,
              unitPrice: dec(it.variacao.preco),
            })),
          },
        },
      });
      pedidosCriados++;

      if (pago) {
        totalGasto += total;
        if (!ultimaCompra || feitoEm > ultimaCompra) ultimaCompra = feitoEm;
      }
      void pedido;
    }

    const pagos = qtdPedidos > 0 ? await prisma.order.count({ where: { contactId: contato.id, status: { notIn: [OrderStatus.ABERTO, OrderStatus.CANCELADO] } } }) : 0;
    await prisma.contact.update({
      where: { id: contato.id },
      data: {
        totalSpent: dec(totalGasto),
        orderCount: pagos,
        avgTicket: dec(pagos > 0 ? totalGasto / pagos : 0),
        lastPurchaseAt: ultimaCompra,
      },
    });

    contatosCriados.push(contato);
  }

  // ── Conversas ───────────────────────────────────────────────────────────
  console.log("Criando conversas…");

  // Menu de triagem, exatamente como o bot envia.
  const MENU =
    "Olá! 👋\nBem-vindo à RISE.\nPara agilizar seu atendimento, escolha uma opção:\n" +
    "1️⃣ Quero comprar\n2️⃣ Preciso de ajuda com tamanho\n3️⃣ Acompanhar meu pedido\n" +
    "4️⃣ Troca ou devolução\n5️⃣ Falar com um atendente\nDigite o número da opção desejada.";

  // Os roteiros seguem as políticas REAIS do site e as lacunas da base:
  // sem tabela de medidas publicada, dúvida de tamanho vai para a equipe.
  const roteiros: Record<string, { autor: MessageAuthorType; texto: string }[]> = {
    tamanho: [
      { autor: MessageAuthorType.CLIENTE, texto: "Oi! Vi o CONJUNTO LUME no site. Sou 1,65m e uso M em outras marcas, qual tamanho peço?" },
      { autor: MessageAuthorType.BOT, texto: MENU },
      { autor: MessageAuthorType.CLIENTE, texto: "2" },
      { autor: MessageAuthorType.IA, texto: "Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar." },
      { autor: MessageAuthorType.ATENDENTE, texto: "Oi! Aqui é a Luana. O LUME tem modelagem justinha, então no seu caso o M fica certinho. Quer que eu confirme se tem na cor que você viu?" },
    ],
    pedido: [
      { autor: MessageAuthorType.CLIENTE, texto: "Bom dia, queria saber do meu pedido" },
      { autor: MessageAuthorType.BOT, texto: MENU },
      { autor: MessageAuthorType.CLIENTE, texto: "3" },
      { autor: MessageAuthorType.IA, texto: "Claro! Para eu consultar com segurança, me confirma o e-mail usado na compra ou o número do pedido?" },
      { autor: MessageAuthorType.CLIENTE, texto: "1043, comprei na terça" },
      { autor: MessageAuthorType.IA, texto: "Achei aqui! Seu pedido já foi postado e o código de rastreio foi para o e-mail cadastrado. O prazo começa a contar da data de envio e varia conforme a transportadora." },
    ],
    troca: [
      { autor: MessageAuthorType.CLIENTE, texto: "Recebi o MACACÃO PILAR mas ficou grande. Consigo trocar pelo P?" },
      { autor: MessageAuthorType.IA, texto: "Consegue solicitar sim! O prazo é de 7 dias corridos após o recebimento, e a peça precisa estar sem uso, sem lavagem e com a etiqueta fixada. Me passa o número do pedido?" },
      { autor: MessageAuthorType.CLIENTE, texto: "É o 1043. E o frete da devolução, quem paga?" },
      { autor: MessageAuthorType.IA, texto: "Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar." },
      { autor: MessageAuthorType.ATENDENTE, texto: "Oi! Aqui é a Luana, eu resolvo com você. Já anotei o pedido 1043 e o P do PILAR — me manda uma foto da peça com a etiqueta, por favor?" },
    ],
    humano: [
      { autor: MessageAuthorType.CLIENTE, texto: "quero falar com uma pessoa" },
      { autor: MessageAuthorType.BOT, texto: MENU },
      { autor: MessageAuthorType.CLIENTE, texto: "5" },
      { autor: MessageAuthorType.BOT, texto: "Perfeito! Já encaminhei sua solicitação para nossa equipe.\nProtocolo: #{protocolo}\nEnquanto aguarda, você pode enviar fotos, referências ou outras informações que possam ajudar no atendimento." },
    ],
    reclamacao: [
      { autor: MessageAuthorType.CLIENTE, texto: "Meu pedido chegou com a camiseta manchada. Muito decepcionado" },
      { autor: MessageAuthorType.IA, texto: "Sinto muito por isso — não é o que esperamos entregar. Vou passar seu caso para nossa equipe agora." },
    ],
    compra: [
      { autor: MessageAuthorType.CLIENTE, texto: "Oi! Queria um conjunto pra treinar, uso muito na musculação" },
      { autor: MessageAuthorType.IA, texto: "Boa! Temos vários conjuntos: o SERENA e o ZOE saem por R$ 160,00, o LUME e o EVA por R$ 165,00, e o RAPHA por R$ 190,00. Você prefere algo mais neutro ou com cor?" },
      { autor: MessageAuthorType.CLIENTE, texto: "Mais neutro. Dá pra parcelar?" },
      { autor: MessageAuthorType.IA, texto: "Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar." },
    ],
    retirada: [
      { autor: MessageAuthorType.CLIENTE, texto: "Moro aqui em Fortaleza, consigo retirar em vez de pagar frete?" },
      { autor: MessageAuthorType.IA, texto: "Consegue sim! A retirada é na Rua Odorico de Morais, 250, no Jacarecanga, de segunda a sexta das 13h às 18h. A peça fica disponível 30 minutos após o pagamento, quando o status muda para embalado — o prazo para retirar é de até 2 dias úteis." },
    ],
  };

  const estadosDistribuicao: {
    state: ConversationState;
    stage: FunnelStage;
    roteiro: keyof typeof roteiros;
    qtd: number;
  }[] = [
    { state: ConversationState.BOT, stage: FunnelStage.TRIAGEM_AUTOMATICA, roteiro: "humano", qtd: 4 },
    { state: ConversationState.IA, stage: FunnelStage.OPORTUNIDADE_VENDA, roteiro: "compra", qtd: 6 },
    { state: ConversationState.IA, stage: FunnelStage.NOVO_CONTATO, roteiro: "tamanho", qtd: 2 },
    { state: ConversationState.IA, stage: FunnelStage.NOVO_CONTATO, roteiro: "retirada", qtd: 2 },
    { state: ConversationState.AGUARDANDO_ATENDENTE, stage: FunnelStage.AGUARDANDO_ATENDENTE, roteiro: "humano", qtd: 5 },
    { state: ConversationState.AGUARDANDO_ATENDENTE, stage: FunnelStage.AGUARDANDO_ATENDENTE, roteiro: "reclamacao", qtd: 2 },
    { state: ConversationState.ATENDIMENTO_HUMANO, stage: FunnelStage.EM_ATENDIMENTO, roteiro: "troca", qtd: 6 },
    { state: ConversationState.AGUARDANDO_CLIENTE, stage: FunnelStage.AGUARDANDO_PAGAMENTO, roteiro: "compra", qtd: 3 },
    { state: ConversationState.FINALIZADO, stage: FunnelStage.FINALIZADO, roteiro: "pedido", qtd: 12 },
    { state: ConversationState.FINALIZADO, stage: FunnelStage.POS_VENDA, roteiro: "troca", qtd: 4 },
  ];

  let indiceContato = 0;
  let conversasCriadas = 0;

  for (const bloco of estadosDistribuicao) {
    for (let n = 0; n < bloco.qtd; n++) {
      const contato = contatosCriados[indiceContato % contatosCriados.length]!;
      indiceContato++;

      const finalizado = bloco.state === ConversationState.FINALIZADO;
      const naFila = bloco.state === ConversationState.AGUARDANDO_ATENDENTE;
      const comHumano =
        bloco.state === ConversationState.ATENDIMENTO_HUMANO ||
        bloco.state === ConversationState.AGUARDANDO_CLIENTE;

      const abertaEm = finalizado ? diasAtras(inteiro(2, 30)) : diasAtras(0, inteiro(0, 30));
      const roteiro = roteiros[bloco.roteiro]!;
      const responsavel = comHumano || finalizado ? escolher(atendentes) : null;

      const fila =
        bloco.roteiro === "troca" || bloco.roteiro === "reclamacao"
          ? filaTrocas
          : bloco.roteiro === "pedido"
            ? filaPosVenda
            : filaVendas;

      const conversa = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          contactId: contato.id,
          queueId: fila.id,
          assigneeId: responsavel?.id ?? null,
          protocol: gerarProtocolo(),
          state: bloco.state,
          funnelStage: bloco.stage,
          priority: bloco.roteiro === "reclamacao" ? 2 : chance(0.15) ? 1 : 0,
          subject:
            bloco.roteiro === "troca"
              ? "Troca de tamanho"
              : bloco.roteiro === "pedido"
                ? "Status do pedido"
                : bloco.roteiro === "reclamacao"
                  ? "Peça com defeito"
                  : bloco.roteiro === "tamanho"
                    ? "Dúvida de tamanho"
                    : bloco.roteiro === "retirada"
                      ? "Retirada em Fortaleza"
                      : "Interesse em compra",
          sentiment: bloco.roteiro === "reclamacao" ? "negativo" : chance(0.3) ? "positivo" : "neutro",
          lastIntent: bloco.roteiro,
          unreadCount: naFila || bloco.state === ConversationState.BOT ? inteiro(1, 3) : 0,
          wahaSession: "loja-principal",
          openedAt: abertaEm,
          welcomeSentAt: roteiro.some((m) => m.autor === MessageAuthorType.BOT) ? abertaEm : null,
          queuedAt: naFila || comHumano || finalizado ? new Date(abertaEm.getTime() + 120_000) : null,
          firstReplyAt: comHumano || finalizado ? new Date(abertaEm.getTime() + inteiro(60, 900) * 1000) : null,
          lastMessageAt: abertaEm,
          closedAt: finalizado ? new Date(abertaEm.getTime() + inteiro(10, 180) * 60_000) : null,
          closeReason: finalizado ? escolher(["resolvido", "resolvido", "resolvido", "cliente_sem_resposta"]) : null,
          rating: finalizado && chance(0.6) ? inteiro(3, 5) : null,
        },
      });

      // Mensagens do roteiro, espaçadas em minutos.
      let instante = abertaEm.getTime();
      for (const [idx, m] of roteiro.entries()) {
        instante += inteiro(40, 180) * 1000;
        const saida = m.autor !== MessageAuthorType.CLIENTE;
        const quando = new Date(instante);
        await prisma.message.create({
          data: {
            organizationId: org.id,
            conversationId: conversa.id,
            externalId: `seed-${conversa.id}-${idx}`,
            direction: saida ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
            authorType: m.autor,
            authorUserId: m.autor === MessageAuthorType.ATENDENTE ? (responsavel?.id ?? escolher(atendentes).id) : null,
            type: MessageType.TEXT,
            body: m.texto.replace("#{protocolo}", conversa.protocol),
            status: saida ? MessageStatus.LIDO : MessageStatus.LIDO,
            sentAt: quando,
            deliveredAt: saida ? new Date(instante + 2000) : null,
            readAt: saida ? new Date(instante + 30_000) : null,
            createdAt: quando,
            metadata:
              idx === 0 && contato.source === "botao_produto"
                ? { origem: "botao_produto", sku: escolher(variacoesPorProduto).sku }
                : {},
          },
        });
      }
      await prisma.conversation.update({
        where: { id: conversa.id },
        data: { lastMessageAt: new Date(instante) },
      });

      // Transferência para humano: registro de handoff coerente.
      if (naFila || comHumano) {
        await prisma.handoff.create({
          data: {
            conversationId: conversa.id,
            reason:
              bloco.roteiro === "reclamacao"
                ? "insatisfacao"
                : bloco.roteiro === "troca"
                  ? "excecao_comercial"
                  : "pedido_cliente",
            collectedName: contato.name,
            collectedReason: conversa.subject,
            relatedProduct: bloco.roteiro === "troca" ? "MACACÃO PILAR" : null,
            summary:
              bloco.roteiro === "reclamacao"
                ? "Cliente recebeu peça manchada e está insatisfeita. Quer solução imediata."
                : "Cliente pediu para falar com uma pessoa da equipe.",
            aiConfidence: bloco.roteiro === "reclamacao" ? 0.42 : null,
            createdAt: new Date(abertaEm.getTime() + 150_000),
          },
        });
        await prisma.conversationEvent.create({
          data: {
            conversationId: conversa.id,
            type: "state_changed",
            fromValue: ConversationState.IA,
            toValue: ConversationState.AGUARDANDO_ATENDENTE,
            actorType: "ia",
            reason: "transferencia_para_humano",
            createdAt: new Date(abertaEm.getTime() + 150_000),
          },
        });
      }
      if (comHumano && responsavel) {
        await prisma.conversationEvent.create({
          data: {
            conversationId: conversa.id,
            type: "assigned",
            toValue: responsavel.id,
            actorType: "usuario",
            actorId: responsavel.id,
            createdAt: new Date(abertaEm.getTime() + 300_000),
          },
        });
        if (chance(0.4)) {
          await prisma.note.create({
            data: {
              conversationId: conversa.id,
              contactId: contato.id,
              authorId: responsavel.id,
              body: "Cliente recorrente, já comprou outras vezes. Prefere retirar no local em vez de pagar frete.",
              createdAt: new Date(abertaEm.getTime() + 400_000),
            },
          });
        }
      }

      conversasCriadas++;
    }
  }

  // ── Oportunidades ───────────────────────────────────────────────────────
  const oportunidades = [
    { title: "Dois conjuntos para treino", stage: FunnelStage.OPORTUNIDADE_VENDA, valor: 325, prob: 60 },
    { title: "Kit equipe de crossfit — 6 camisetas", stage: FunnelStage.EM_ATENDIMENTO, valor: 840, prob: 75 },
    { title: "CONJUNTO RAPHA — aguardando pagamento", stage: FunnelStage.AGUARDANDO_PAGAMENTO, valor: 190, prob: 90 },
    { title: "Presente de aniversário — macaquinho", stage: FunnelStage.PEDIDO_REALIZADO, valor: 130, prob: 100 },
    { title: "CONJUNTO LOREN — quer avisar quando voltar", stage: FunnelStage.AGUARDANDO_ATENDENTE, valor: 160, prob: 30 },
    { title: "Regatas Move By The Spirit — 3 peças", stage: FunnelStage.OPORTUNIDADE_VENDA, valor: 330, prob: 45 },
  ];
  for (const [i, o] of oportunidades.entries()) {
    const contato = contatosCriados[i % contatosCriados.length]!;
    const variacao = escolher(variacoesPorProduto);
    await prisma.opportunity.create({
      data: {
        organizationId: org.id,
        contactId: contato.id,
        title: o.title,
        stage: o.stage,
        estimatedValue: dec(o.valor),
        probability: o.prob,
        productsOfInterest: [{ sku: variacao.sku, nome: variacao.produtoNome, tamanho: variacao.tamanho, cor: variacao.cor }],
        followUpAt: diasAtras(-inteiro(1, 7)),
        ownerId: escolher(atendentes).id,
        wonAt: o.stage === FunnelStage.PEDIDO_REALIZADO ? diasAtras(2) : null,
      },
    });
  }

  // ── Base de conhecimento ────────────────────────────────────────────────
  // Status PENDENTE: a indexação real (chunking + embeddings) entra na Etapa 7.
  console.log("Criando base de conhecimento…");
  for (const d of DOCUMENTOS) {
    const daWeb = d.fonte.startsWith("http");
    await prisma.knowledgeDocument.create({
      data: {
        organizationId: org.id,
        title: d.titulo,
        category: d.categoria,
        sourceType: daWeb ? KbSourceType.URL : KbSourceType.TEXTO,
        sourceUrl: daWeb ? d.fonte : null,
        content: d.conteudo,
        status: IndexStatus.PENDENTE,
        statusMessage: d.exigeConfirmacao
          ? "EXIGE CONFIRMAÇÃO DA LOJA — a IA não pode responder com base neste documento."
          : `Origem: ${d.fonte}. Aguardando o pipeline de indexação (Etapa 7).`,
        active: true,
      },
    });
  }

  // ── Automações ──────────────────────────────────────────────────────────
  const automacoes = [
    {
      name: "Boas-vindas e menu de triagem",
      description: "Envia o menu na primeira mensagem de uma conversa nova.",
      trigger: "message.received",
      conditions: [
        { field: "conversation.state", operator: "eq", value: "BOT" },
        { field: "conversation.welcomeSentAt", operator: "is_null", value: true },
      ],
      actions: [{ type: "send_welcome_menu", params: {} }],
      priority: 10,
    },
    {
      name: "Pedido de atendente humano",
      description: "Coloca na fila quando a cliente pede uma pessoa.",
      trigger: "intent.human_requested",
      conditions: [],
      actions: [
        { type: "transfer_to_queue", params: { strategy: "por_intencao" } },
        { type: "notify_available_agents", params: {} },
      ],
      priority: 20,
    },
    {
      name: "Confirmação de pagamento",
      description: "Avisa a cliente quando o pedido é pago.",
      trigger: "order.paid",
      conditions: [{ field: "contact.consent.WHATSAPP_TRANSACIONAL", operator: "eq", value: true }],
      actions: [
        { type: "send_template", params: { template: "pagamento_confirmado" } },
        { type: "set_funnel_stage", params: { stage: "PEDIDO_REALIZADO" } },
      ],
      priority: 30,
    },
    {
      name: "Envio do rastreamento",
      description: "Manda o código assim que o pedido é postado.",
      trigger: "order.shipped",
      conditions: [{ field: "order.trackingCode", operator: "is_not_null", value: true }],
      actions: [{ type: "send_template", params: { template: "rastreamento" } }],
      priority: 30,
    },
    {
      name: "Pós-venda após a entrega",
      description: "Inicia o pós-venda dois dias depois da entrega.",
      trigger: "order.delivered",
      conditions: [],
      actions: [{ type: "schedule_message", params: { delayHours: 48, template: "pos_venda" } }],
      priority: 40,
    },
    {
      name: "Aviso de reposição de estoque",
      description: "Avisa quem demonstrou interesse na variação esgotada.",
      trigger: "product.back_in_stock",
      conditions: [{ field: "waitlist.count", operator: "gt", value: 0 }],
      actions: [{ type: "notify_waitlist", params: {} }],
      priority: 50,
    },
    {
      name: "Alerta de conversa parada",
      description: "Cutuca o responsável quando o SLA estoura.",
      trigger: "conversation.idle",
      conditions: [{ field: "conversation.minutesSinceLastReply", operator: "gt", value: 15 }],
      actions: [
        { type: "notify_user", params: { target: "assignee" } },
        { type: "notify_role", params: { role: "SUPERVISOR" } },
      ],
      priority: 60,
    },
    {
      name: "Pesquisa de satisfação",
      description: "Pede nota de 1 a 5 ao finalizar o atendimento.",
      trigger: "conversation.closed",
      conditions: [{ field: "conversation.durationMinutes", operator: "gt", value: 2 }],
      actions: [{ type: "send_template", params: { template: "avaliacao_csat" } }],
      priority: 70,
    },
    {
      name: "IA com baixa confiança",
      description: "Transfere para humano quando a IA não tem certeza.",
      trigger: "ai.low_confidence",
      conditions: [{ field: "ai.confidence", operator: "lt", value: 0.7 }],
      actions: [
        { type: "send_text", params: { text: "Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar." } },
        { type: "transfer_to_queue", params: { strategy: "por_intencao" } },
      ],
      priority: 5,
    },
  ];

  // Automações que dependem de eventos de e-commerce nascem DESLIGADAS:
  // sem integração de loja, esses gatilhos nunca disparam. Ligar quando a
  // integração entrar.
  const dependemDaLoja = new Set(["order.paid", "order.shipped", "order.delivered", "product.back_in_stock"]);

  for (const a of automacoes) {
    const dependente = dependemDaLoja.has(a.trigger);
    await prisma.automation.create({
      data: {
        organizationId: org.id,
        name: a.name,
        description: dependente
          ? `${a.description} [desligada: depende da integração com a loja, ainda não configurada]`
          : a.description,
        trigger: a.trigger,
        conditions: a.conditions,
        actions: a.actions,
        enabled: !dependente,
        priority: a.priority,
      },
    });
  }

  // ── Integrações ─────────────────────────────────────────────────────────
  // DISABLED de propósito: nenhuma credencial no seed, nenhuma simulação de
  // conexão ativa. Configurar em Admin → Integrações.
  // Nuvemshop está fora do escopo por ora — o registro nem é criado.
  for (const provider of [IntegrationProvider.WAHA, IntegrationProvider.AI]) {
    await prisma.integration.create({
      data: {
        organizationId: org.id,
        provider,
        mode: IntegrationMode.DISABLED,
        config:
          provider === IntegrationProvider.WAHA
            ? { baseUrl: "http://localhost:3001", session: "rise-principal" }
            : { model: "claude-sonnet-5", embeddingModel: "text-embedding-3-small" },
        status: "desconectado",
        statusMessage: "Integração não configurada. Informe as credenciais em Admin → Integrações.",
      },
    });
  }

  // ── Resumo ──────────────────────────────────────────────────────────────
  const lacunas = DOCUMENTOS.filter((d) => d.exigeConfirmacao).length;

  console.log(`
Seed concluído — RISE (userisefit.com.br)
  organização ......... ${org.name} (${org.slug}) · ${org.timezone}
  usuários ............ ${usuarios.length} (${atendentes.length} atendentes) [fictícios]
  filas ............... ${filas.length}
  etiquetas ........... ${etiquetas.length}
  produtos ............ ${PRODUTOS.length} [nomes e preços REAIS do site]
  variações ........... ${variacoesCriadas} [tamanho/cor/estoque de desenvolvimento — reais: ${VARIACOES_SAO_REAIS}]
  contatos ............ ${contatosCriados.length} [fictícios]
  pedidos ............. ${pedidosCriados} [fictícios]
  conversas ........... ${conversasCriadas} [fictícias]
  documentos da base .. ${DOCUMENTOS.length}, sendo ${lacunas} marcados EXIGE_CONFIRMACAO
  automações .......... ${automacoes.length} (${automacoes.length - 4} ativas; 4 desligadas por dependerem da loja)
  integrações ......... 2 (WAHA, IA), ambas DISABLED · Nuvemshop fora do escopo

Acesso de desenvolvimento (senha única: crm@2026)
  Administrador ....... renata.maciel@userisefit.com.br
  Supervisor .......... paulo.sarmento@userisefit.com.br
  Atendente ........... ana.ramos@userisefit.com.br

Pendências para a loja confirmar (ver documento "Lacunas" na base):
  pagamento e parcelamento · tabela de medidas · frete e prazos ·
  quem paga o frete da troca · grade de tamanhos/cores · CNPJ e redes ·
  divergência do e-mail (userisefit@ vs userisefiti@)
`);
}

main()
  .catch((error) => {
    console.error("Falha no seed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
