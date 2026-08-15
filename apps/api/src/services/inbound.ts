import {
  canRespond,
  gerarProtocolo,
  interpretarOpcao,
  montarMenu,
  montarTransferencia,
  shouldOpenNewConversation,
  type ConversationState,
  type InboundMessage,
} from "@crm/core";
import { prisma } from "@crm/db";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../env.js";
import { waha } from "../integrations/waha.js";

/**
 * Pipeline de entrada de mensagem.
 *
 * NOTA DE ARQUITETURA: o plano prevê este processamento em worker BullMQ.
 * Por ora roda no processo da API, logo após o webhook responder — o suficiente
 * para testar ponta a ponta. A função já está isolada para o worker chamá-la
 * sem alteração quando a fila entrar (Etapa 4).
 */
export async function processarMensagemRecebida(
  msg: InboundMessage,
  log: FastifyBaseLogger,
): Promise<void> {
  const org = await prisma.organization.findFirst({ where: { slug: "rise" } });
  if (!org) {
    log.error("organização não encontrada — rode o seed");
    return;
  }

  const agora = new Date();
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const nomeLoja = typeof settings["storeName"] === "string" ? settings["storeName"] : env.STORE_NAME;
  const janela =
    typeof settings["inactivityWindowMinutes"] === "number"
      ? settings["inactivityWindowMinutes"]
      : env.INACTIVITY_WINDOW_MINUTES;

  // 1. Contato — identificado pelo chatId.
  // O WhatsApp pode entregar um LID (identificador interno, ex.: 31886072111283@lid)
  // em vez do número. Nesse caso o telefone fica nulo: derivar um número do LID
  // produziria um telefone que não existe.
  const ehLid = msg.chatId.endsWith("@lid");
  const telefone = ehLid ? null : msg.chatId.replace(/@.*$/, "");
  const pushName = msg.pushName?.trim();

  const existente = await prisma.contact.findUnique({
    where: { organizationId_waChatId: { organizationId: org.id, waChatId: msg.chatId } },
    select: { id: true, name: true },
  });

  // Só melhora o nome: nunca sobrescreve um nome já ajustado pela equipe com o
  // pushName do WhatsApp. "Provisório" = ainda igual ao identificador.
  const nomeProvisorio = existente ? existente.name === (telefone ?? msg.chatId) : false;

  const contato = existente
    ? await prisma.contact.update({
        where: { id: existente.id },
        data: {
          lastContactAt: agora,
          ...(pushName && nomeProvisorio ? { name: pushName } : {}),
        },
      })
    : await prisma.contact.create({
        data: {
          organizationId: org.id,
          waChatId: msg.chatId,
          phone: telefone,
          name: pushName || telefone || msg.chatId,
          source: "whatsapp",
          lastContactAt: agora,
        },
      });

  // 2. Conversa — reaproveita a aberta ou abre nova após a janela de silêncio.
  const ultima = await prisma.conversation.findFirst({
    where: { organizationId: org.id, contactId: contato.id },
    orderBy: { lastMessageAt: "desc" },
  });

  const precisaNova =
    !ultima ||
    shouldOpenNewConversation({
      state: ultima.state as ConversationState,
      lastMessageAt: ultima.lastMessageAt,
      now: agora,
      inactivityWindowMinutes: janela,
    });

  const filaPadrao = await prisma.queue.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });

  const conversa = precisaNova
    ? await prisma.conversation.create({
        data: {
          organizationId: org.id,
          contactId: contato.id,
          queueId: filaPadrao?.id ?? null,
          protocol: gerarProtocolo(),
          state: "BOT",
          funnelStage: "NOVO_CONTATO",
          wahaSession: msg.session,
          openedAt: agora,
          lastMessageAt: agora,
        },
      })
    : ultima;

  // 3. Mensagem no histórico. A unique (organizationId, externalId) é a rede de
  // segurança final contra reentrega do mesmo evento.
  try {
    await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: conversa.id,
        externalId: msg.externalId,
        direction: "INBOUND",
        authorType: "CLIENTE",
        type: msg.type,
        body: msg.body ?? null,
        mediaUrl: msg.mediaUrl ?? null,
        mediaMimeType: msg.mediaMimeType ?? null,
        caption: msg.caption ?? null,
        status: "LIDO",
        sentAt: msg.timestamp,
        createdAt: msg.timestamp,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      log.info({ externalId: msg.externalId }, "mensagem já registrada — ignorando");
      return;
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { lastMessageAt: agora, unreadCount: { increment: 1 } },
  });

  // 4. Quem responde agora? Ponto único de decisão.
  const estado = conversa.state as ConversationState;
  const decisao = canRespond("BOT", estado);
  if (!decisao.allowed) {
    log.info({ conversationId: conversa.id, estado, motivo: decisao.reason }, "automação pausada");
    return;
  }

  // 5. Fluxo do bot.
  if (!conversa.welcomeSentAt) {
    // Marca ANTES de enviar, condicionado a ainda estar nulo. Duas mensagens
    // que chegam no mesmo instante disputam esta linha: só uma atualiza, e só
    // ela envia o menu. Ler-depois-escrever deixava as duas passarem, e o
    // cliente recebia o menu em duplicidade.
    const ganhou = await prisma.conversation.updateMany({
      where: { id: conversa.id, welcomeSentAt: null },
      data: { welcomeSentAt: new Date(), funnelStage: "TRIAGEM_AUTOMATICA" },
    });

    if (ganhou.count === 0) {
      log.info({ conversationId: conversa.id }, "menu já enviado por outra mensagem simultânea");
      return;
    }

    await enviar(org.id, conversa.id, msg.chatId, montarMenu({ nomeCliente: primeiroNome(contato.name), nomeLoja }), log);
    return;
  }

  const intencao = interpretarOpcao(msg.body ?? "");
  log.info({ conversationId: conversa.id, intencao }, "opção do menu interpretada");

  if (intencao === "humano") {
    await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, log);
    return;
  }

  if (intencao === "desconhecida") {
    // Duas falhas seguidas de interpretação → transfere, conforme o fluxo.
    const falhas = conversa.intentFailures + 1;
    if (falhas >= 2) {
      await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, log, "falha_intencao");
      return;
    }
    await prisma.conversation.update({ where: { id: conversa.id }, data: { intentFailures: falhas } });
    await enviar(
      org.id,
      conversa.id,
      msg.chatId,
      "Não entendi a opção. Digite o número de 1 a 5, por favor. Se preferir falar com uma pessoa, digite 5.",
      log,
    );
    return;
  }

  // Opção válida: zera o contador de falhas.
  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { intentFailures: 0, lastIntent: intencao },
  });

  // Opções 1 a 4 exigem a IA, que ainda não está implementada (Etapa 8).
  // Enquanto isso, o caminho honesto é a fila humana — não uma resposta fingida.
  // O aviso abaixo evita que o cliente ache que caiu num buraco: ele escolheu
  // "quero comprar" e recebeu uma transferência sem explicação.
  const rotulo: Record<string, string> = {
    compra: "sobre uma compra",
    tamanho: "sobre tamanho",
    pedido: "sobre seu pedido",
    troca: "sobre troca ou devolução",
  };
  await enviar(
    org.id,
    conversa.id,
    msg.chatId,
    `Entendi, você precisa de ajuda ${rotulo[intencao] ?? "com seu atendimento"}. Vou chamar alguém da equipe para te atender.`,
    log,
  );
  await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, log, `menu_${intencao}`);
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

/** Envia pela WAHA e registra no histórico com o id devolvido pelo gateway. */
async function enviar(
  organizationId: string,
  conversationId: string,
  chatId: string,
  texto: string,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const resultado = await waha.sendText({ chatId, text: texto });
    await prisma.message.create({
      data: {
        organizationId,
        conversationId,
        externalId: resultado.externalId,
        direction: "OUTBOUND",
        authorType: "BOT",
        type: "TEXT",
        body: texto,
        status: "ENVIADO",
        sentAt: resultado.timestamp,
      },
    });
  } catch (error) {
    // A falha fica visível no histórico, não some num log de servidor.
    const mensagem = error instanceof Error ? error.message : String(error);
    log.error({ err: error, conversationId }, "falha ao enviar mensagem pela WAHA");
    await prisma.message.create({
      data: {
        organizationId,
        conversationId,
        direction: "OUTBOUND",
        authorType: "BOT",
        type: "TEXT",
        body: texto,
        status: "FALHA",
        errorMessage: mensagem.slice(0, 1000),
      },
    });
  }
}

async function transferirParaHumano(
  organizationId: string,
  conversationId: string,
  protocolo: string,
  chatId: string,
  log: FastifyBaseLogger,
  motivo = "pedido_cliente",
): Promise<void> {
  await enviar(organizationId, conversationId, chatId, montarTransferencia(protocolo), log);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      state: "AGUARDANDO_ATENDENTE",
      funnelStage: "AGUARDANDO_ATENDENTE",
      queuedAt: new Date(),
      intentFailures: 0,
    },
  });

  await prisma.handoff.upsert({
    where: { conversationId },
    create: { conversationId, reason: motivo },
    update: { reason: motivo },
  });

  await prisma.conversationEvent.create({
    data: {
      conversationId,
      type: "state_changed",
      fromValue: "BOT",
      toValue: "AGUARDANDO_ATENDENTE",
      actorType: "bot",
      reason: motivo,
    },
  });

  log.info({ conversationId, motivo }, "conversa transferida para a fila humana");
}
