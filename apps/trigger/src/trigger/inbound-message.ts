import {
  canRespond,
  gerarProtocolo,
  interpretarOpcao,
  montarMenu,
  montarSaudacaoColeta,
  montarTransferencia,
  shouldOpenNewConversation,
  type ConversationState,
  type InboundMessageJob,
} from "@crm/core";
import { prisma } from "@crm/db";
import { logger, task } from "@trigger.dev/sdk/v3";
import { resolverOrganizacaoPorSessao } from "./org.js";
import { chaveDeMidia, storage } from "./storage.js";
import { waha } from "./waha.js";

/**
 * Equivalente da task a apps/worker/src/processors/inbound-message.ts —
 * mesma lógica de negócio, hospedada no Trigger.dev em vez do nosso próprio
 * processo. Não importado dali: assinatura de log e de entrada são
 * diferentes (SDK do Trigger.dev vs. BullMQ Job + pino), e a ordem dos
 * argumentos do logger é invertida (mensagem primeiro aqui; objeto primeiro
 * no pino) — juntar os dois exigiria um wrapper de log só para igualar
 * assinatura, mais risco que benefício nesta fase.
 */
export const processInboundMessage = task({
  id: "process-inbound-message",
  retry: { maxAttempts: 5, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2 },
  run: async (payload: InboundMessageJob) => {
    const { message: msg, webhookEventId } = payload;

    const org = await resolverOrganizacaoPorSessao(msg.session);
    if (!org) {
      logger.error("nenhuma organização configurada para esta sessão WAHA", { session: msg.session });
      await marcarProcessado(webhookEventId, `sessão WAHA '${msg.session}' não está associada a nenhuma organização`);
      return;
    }

    const agora = new Date();
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const nomeLoja = typeof settings["storeName"] === "string" ? settings["storeName"] : org.name;
    const janela = typeof settings["inactivityWindowMinutes"] === "number" ? settings["inactivityWindowMinutes"] : 360;
    const flowType = typeof settings["flowType"] === "string" ? settings["flowType"] : "menu";

    const telefone = msg.chatId.endsWith("@lid") ? null : msg.chatId.replace(/@.*$/, "");
    const pushName = msg.pushName?.trim();

    const existente = await prisma.contact.findUnique({
      where: { organizationId_waChatId: { organizationId: org.id, waChatId: msg.chatId } },
      select: { id: true, name: true },
    });
    const nomeProvisorio = existente ? existente.name === (telefone ?? msg.chatId) : false;

    const contato = existente
      ? await prisma.contact.update({
          where: { id: existente.id },
          data: { lastContactAt: agora, ...(pushName && nomeProvisorio ? { name: pushName } : {}) },
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

    const filaPadrao = await prisma.queue.findFirst({ where: { organizationId: org.id, isDefault: true } });

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

    let chaveMidia: string | null = null;
    if (msg.mediaUrl) {
      try {
        const { conteudo, mimeType } = await waha.baixarMidia(msg.mediaUrl);
        chaveMidia = await storage.guardar(
          chaveDeMidia(conversa.id, msg.externalId, msg.mediaMimeType ?? mimeType),
          conteudo,
          msg.mediaMimeType ?? mimeType,
        );
        logger.info("mídia guardada", { chave: chaveMidia, bytes: conteudo.length });
      } catch (error) {
        logger.error("falha ao guardar mídia recebida", { err: String(error), externalId: msg.externalId });
      }
    }

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
          mediaUrl: chaveMidia,
          mediaMimeType: msg.mediaMimeType ?? null,
          caption: msg.caption ?? null,
          status: "LIDO",
          sentAt: msg.timestamp,
          createdAt: msg.timestamp,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        logger.info("mensagem já registrada — ignorando", { externalId: msg.externalId });
        await marcarProcessado(webhookEventId);
        return;
      }
      throw error;
    }

    await prisma.conversation.update({
      where: { id: conversa.id },
      data: { lastMessageAt: agora, unreadCount: { increment: 1 } },
    });

    // Sem SSE nesta variante — a inbox do teste na Vercel usa polling
    // (ver REALTIME_MODE em apps/web/src/lib/api.ts), então não há canal de
    // tempo real para publicar aqui.

    const estado = conversa.state as ConversationState;
    const decisao = canRespond("BOT", estado);
    if (!decisao.allowed) {
      logger.info("automação pausada", { conversationId: conversa.id, estado, motivo: decisao.reason });
      await marcarProcessado(webhookEventId);
      return;
    }

    if (flowType === "greet_and_collect") {
      if (!conversa.welcomeSentAt) {
        const ganhou = await prisma.conversation.updateMany({
          where: { id: conversa.id, welcomeSentAt: null },
          data: { welcomeSentAt: new Date(), funnelStage: "TRIAGEM_AUTOMATICA" },
        });
        if (ganhou.count === 0) {
          await marcarProcessado(webhookEventId);
          return;
        }
        await enviar(org.id, conversa.id, msg.chatId, montarSaudacaoColeta({ nomeCliente: primeiroNome(contato.name), nomeEmpresa: nomeLoja }));
        await marcarProcessado(webhookEventId);
        return;
      }
      await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, "solicitacao_inicial", msg.body ?? undefined);
      await marcarProcessado(webhookEventId);
      return;
    }

    if (!conversa.welcomeSentAt) {
      const ganhou = await prisma.conversation.updateMany({
        where: { id: conversa.id, welcomeSentAt: null },
        data: { welcomeSentAt: new Date(), funnelStage: "TRIAGEM_AUTOMATICA" },
      });
      if (ganhou.count === 0) {
        await marcarProcessado(webhookEventId);
        return;
      }
      await enviar(org.id, conversa.id, msg.chatId, montarMenu({ nomeCliente: primeiroNome(contato.name), nomeLoja }));
      await marcarProcessado(webhookEventId);
      return;
    }

    const intencao = interpretarOpcao(msg.body ?? "");

    if (intencao === "humano") {
      await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId);
      await marcarProcessado(webhookEventId);
      return;
    }

    if (intencao === "desconhecida") {
      const falhas = conversa.intentFailures + 1;
      if (falhas >= 2) {
        await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, "falha_intencao");
        await marcarProcessado(webhookEventId);
        return;
      }
      await prisma.conversation.update({ where: { id: conversa.id }, data: { intentFailures: falhas } });
      await enviar(org.id, conversa.id, msg.chatId, "Não entendi a opção. Digite o número de 1 a 5, por favor. Se preferir falar com uma pessoa, digite 5.");
      await marcarProcessado(webhookEventId);
      return;
    }

    await prisma.conversation.update({ where: { id: conversa.id }, data: { intentFailures: 0, lastIntent: intencao } });

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
    );
    await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, `menu_${intencao}`);
    await marcarProcessado(webhookEventId);
  },
});

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

async function marcarProcessado(webhookEventId: string, erro?: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { processedAt: new Date(), ...(erro ? { error: erro } : {}) },
  });
}

async function enviar(organizationId: string, conversationId: string, chatId: string, texto: string): Promise<void> {
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
    const mensagem = error instanceof Error ? error.message : String(error);
    logger.error("falha ao enviar mensagem pela WAHA", { err: mensagem, conversationId });
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
  motivo = "pedido_cliente",
  resumo?: string,
): Promise<void> {
  await enviar(organizationId, conversationId, chatId, montarTransferencia(protocolo));

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { state: "AGUARDANDO_ATENDENTE", funnelStage: "AGUARDANDO_ATENDENTE", queuedAt: new Date(), intentFailures: 0 },
  });

  await prisma.handoff.upsert({
    where: { conversationId },
    create: { conversationId, reason: motivo, ...(resumo ? { summary: resumo } : {}) },
    update: { reason: motivo, ...(resumo ? { summary: resumo } : {}) },
  });

  await prisma.conversationEvent.create({
    data: { conversationId, type: "state_changed", fromValue: "BOT", toValue: "AGUARDANDO_ATENDENTE", actorType: "bot", reason: motivo },
  });

  logger.info("conversa transferida para a fila humana", { conversationId, motivo });
}
