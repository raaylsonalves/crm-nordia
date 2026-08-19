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
import type { Job } from "bullmq";
import type { Logger } from "pino";
import { env } from "../env.js";
import { chaveDeMidia, storage } from "../integrations/storage.js";
import { waha } from "../integrations/waha.js";
import { resolverOrganizacaoPorSessao } from "../org.js";
import { publicar } from "../realtime.js";

/**
 * Pipeline de entrada de mensagem — movido da API para o worker.
 *
 * Rodar aqui, e não no processo HTTP, é o que garante que uma mensagem
 * sobreviva a um restart da API no meio do caminho: o job fica na fila do
 * Redis até ser processado com sucesso, com retentativa automática em caso
 * de falha (rede, WAHA fora do ar, banco temporariamente indisponível).
 */
export async function processarMensagemRecebida(job: Job<InboundMessageJob>, log: Logger): Promise<void> {
  const { message: msg, webhookEventId } = job.data;

  // A sessão é quem diz de qual organização é a mensagem — nunca um valor
  // fixo. Sem isso, ligar uma segunda empresa (ex.: NORDIA) processaria as
  // mensagens dela sob a organização errada.
  const org = await resolverOrganizacaoPorSessao(msg.session);
  if (!org) {
    // Não é um erro transitório — retentar não resolve. Registra e não relança.
    log.error({ session: msg.session }, "nenhuma organização configurada para esta sessão WAHA");
    await marcarProcessado(webhookEventId, `sessão WAHA '${msg.session}' não está associada a nenhuma organização`);
    return;
  }

  const agora = new Date();
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const nomeLoja = typeof settings["storeName"] === "string" ? settings["storeName"] : env.STORE_NAME;
  const janela =
    typeof settings["inactivityWindowMinutes"] === "number"
      ? settings["inactivityWindowMinutes"]
      : env.INACTIVITY_WINDOW_MINUTES;
  // "menu" (padrão, comportamento da RISE) ou "greet_and_collect" (NORDIA):
  // ver a ramificação no passo 6, abaixo.
  const flowType = typeof settings["flowType"] === "string" ? settings["flowType"] : "menu";

  // 1. Contato — identificado pelo chatId.
  // O WhatsApp pode entregar um LID (identificador interno, ex.: 31886072111283@lid)
  // em vez do número. Nesse caso o telefone fica nulo: derivar um número do LID
  // produziria um telefone que não existe.
  const telefone = msg.chatId.endsWith("@lid") ? null : msg.chatId.replace(/@.*$/, "");
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

  // 3. Mídia: baixar AGORA e guardar no nosso storage.
  // A WAHA apaga o arquivo por TTL (padrão 3 minutos). Guardar só a URL dela
  // significa perder a foto do cliente pouco depois — e é justamente o
  // histórico que o atendimento precisa consultar semanas depois.
  let chaveMidia: string | null = null;
  if (msg.mediaUrl) {
    try {
      const { conteudo, mimeType } = await waha.baixarMidia(msg.mediaUrl);
      chaveMidia = await storage.guardar(
        chaveDeMidia(conversa.id, msg.externalId, msg.mediaMimeType ?? mimeType),
        conteudo,
        msg.mediaMimeType ?? mimeType,
      );
      log.info({ chave: chaveMidia, bytes: conteudo.length }, "mídia guardada");
    } catch (error) {
      // A mensagem entra no histórico mesmo assim: perder a mídia é ruim,
      // perder o registro de que o cliente mandou algo é pior. Não relança —
      // isso não é um motivo para o BullMQ retentar a mensagem inteira.
      log.error({ err: error, externalId: msg.externalId }, "falha ao guardar mídia recebida");
    }
  }

  // 4. Mensagem no histórico. A unique (organizationId, externalId) é a rede de
  // segurança final contra reentrega do mesmo evento — inclusive contra dois
  // workers pegando o mesmo job por engano.
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
      log.info({ externalId: msg.externalId }, "mensagem já registrada — ignorando");
      await marcarProcessado(webhookEventId);
      return;
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { lastMessageAt: agora, unreadCount: { increment: 1 } },
  });

  await publicar({
    tipo: "message.created",
    conversationId: conversa.id,
    dados: { quem: "CLIENTE", texto: msg.body ?? "", contato: contato.name, protocolo: conversa.protocol },
  });

  // 5. Quem responde agora? Ponto único de decisão.
  const estado = conversa.state as ConversationState;
  const decisao = canRespond("BOT", estado);
  if (!decisao.allowed) {
    log.info({ conversationId: conversa.id, estado, motivo: decisao.reason }, "automação pausada");
    await marcarProcessado(webhookEventId);
    return;
  }

  // 6. Fluxo do bot.
  //
  // Organizações que não vendem produto por produto (ex.: a NORDIA, uma
  // prestadora de soluções tecnológicas) não precisam de menu numérico: a
  // saudação já pede o contexto do que a pessoa procura, e a resposta dela
  // vai direto para a fila humana como resumo do pedido. Isso não altera em
  // nada o fluxo de menu abaixo, usado pela RISE.
  if (flowType === "greet_and_collect") {
    if (!conversa.welcomeSentAt) {
      const ganhou = await prisma.conversation.updateMany({
        where: { id: conversa.id, welcomeSentAt: null },
        data: { welcomeSentAt: new Date(), funnelStage: "TRIAGEM_AUTOMATICA" },
      });
      if (ganhou.count === 0) {
        log.info({ conversationId: conversa.id }, "saudação já enviada por outra mensagem simultânea");
        await marcarProcessado(webhookEventId);
        return;
      }
      await enviar(
        org.id,
        conversa.id,
        msg.chatId,
        montarSaudacaoColeta({ nomeCliente: primeiroNome(contato.name), nomeEmpresa: nomeLoja }),
        log,
      );
      await marcarProcessado(webhookEventId);
      return;
    }

    // A saudação já foi enviada: o que o cliente escreveu agora É o pedido.
    // Vira o resumo do handoff, para o representante não precisar perguntar
    // de novo o que já foi dito.
    await transferirParaHumano(
      org.id,
      conversa.id,
      conversa.protocol,
      msg.chatId,
      log,
      "solicitacao_inicial",
      msg.body ?? undefined,
    );
    await marcarProcessado(webhookEventId);
    return;
  }

  if (!conversa.welcomeSentAt) {
    // Marca ANTES de enviar, condicionado a ainda estar nulo. Duas mensagens
    // que chegam quase juntas (dois jobs, possivelmente dois workers)
    // disputam esta linha: só uma atualiza, e só ela envia o menu.
    const ganhou = await prisma.conversation.updateMany({
      where: { id: conversa.id, welcomeSentAt: null },
      data: { welcomeSentAt: new Date(), funnelStage: "TRIAGEM_AUTOMATICA" },
    });

    if (ganhou.count === 0) {
      log.info({ conversationId: conversa.id }, "menu já enviado por outra mensagem simultânea");
      await marcarProcessado(webhookEventId);
      return;
    }

    await enviar(org.id, conversa.id, msg.chatId, montarMenu({ nomeCliente: primeiroNome(contato.name), nomeLoja }), log);
    await marcarProcessado(webhookEventId);
    return;
  }

  const intencao = interpretarOpcao(msg.body ?? "");
  log.info({ conversationId: conversa.id, intencao }, "opção do menu interpretada");

  if (intencao === "humano") {
    await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, log);
    await marcarProcessado(webhookEventId);
    return;
  }

  if (intencao === "desconhecida") {
    const falhas = conversa.intentFailures + 1;
    if (falhas >= 2) {
      await transferirParaHumano(org.id, conversa.id, conversa.protocol, msg.chatId, log, "falha_intencao");
      await marcarProcessado(webhookEventId);
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
    await marcarProcessado(webhookEventId);
    return;
  }

  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { intentFailures: 0, lastIntent: intencao },
  });

  // Opções 1 a 4 exigem a IA, que ainda não está implementada (Etapa 8).
  // Enquanto isso, o caminho honesto é a fila humana — não uma resposta fingida.
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
  await marcarProcessado(webhookEventId);
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

async function marcarProcessado(webhookEventId: string, erro?: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { processedAt: new Date(), ...(erro ? { error: erro } : {}) },
  });
}

/** Envia pela WAHA e registra no histórico com o id devolvido pelo gateway. */
async function enviar(
  organizationId: string,
  conversationId: string,
  chatId: string,
  texto: string,
  log: Logger,
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
  log: Logger,
  motivo = "pedido_cliente",
  resumo?: string,
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
    create: { conversationId, reason: motivo, ...(resumo ? { summary: resumo } : {}) },
    update: { reason: motivo, ...(resumo ? { summary: resumo } : {}) },
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

  await publicar({ tipo: "conversation.updated", conversationId, dados: { estado: "AGUARDANDO_ATENDENTE" } });

  log.info({ conversationId, motivo }, "conversa transferida para a fila humana");
}
