/**
 * Quem pode responder numa conversa — o ponto ÚNICO que decide isso.
 *
 * Bot, IA e atendente consultam esta função antes de enviar qualquer mensagem,
 * e o worker revalida no momento do envio: a conversa pode ter sido assumida
 * enquanto o job estava na fila. Sem essa revalidação, a IA responde por cima
 * do atendente.
 */

export type ConversationState =
  | "BOT"
  | "IA"
  | "AGUARDANDO_ATENDENTE"
  | "ATENDIMENTO_HUMANO"
  | "AGUARDANDO_CLIENTE"
  | "FINALIZADO";

export type Actor = "BOT" | "IA" | "ATENDENTE" | "SISTEMA";

export interface ControlDecision {
  allowed: boolean;
  /** Motivo legível — vai para o log de integração e para a auditoria. */
  reason: string;
}

const PERMITIDO: Record<ConversationState, Actor[]> = {
  // Fluxo automatizado no comando.
  BOT: ["BOT", "SISTEMA", "ATENDENTE"],
  // IA autorizada; o atendente pode intervir a qualquer momento.
  IA: ["IA", "SISTEMA", "ATENDENTE"],
  // Na fila: nenhum ator automático fala. Silêncio até alguém assumir.
  AGUARDANDO_ATENDENTE: ["ATENDENTE", "SISTEMA"],
  // Assumida: só o atendente.
  ATENDIMENTO_HUMANO: ["ATENDENTE", "SISTEMA"],
  // Esperando o cliente: o atendente pode voltar a falar, automação não.
  AGUARDANDO_CLIENTE: ["ATENDENTE", "SISTEMA"],
  // Encerrada: ninguém responde. Nova mensagem abre outra conversa.
  FINALIZADO: [],
};

export function canRespond(actor: Actor, state: ConversationState): ControlDecision {
  const permitidos = PERMITIDO[state];

  if (permitidos.includes(actor)) {
    return { allowed: true, reason: `${actor} pode responder em ${state}` };
  }

  if (state === "FINALIZADO") {
    return {
      allowed: false,
      reason: "Conversa finalizada: nenhuma resposta é enviada. Reabra ou aguarde nova conversa.",
    };
  }

  if (actor === "BOT" || actor === "IA") {
    return {
      allowed: false,
      reason: `Automação pausada: a conversa está em ${state} e pertence ao atendimento humano.`,
    };
  }

  return { allowed: false, reason: `${actor} não pode responder em ${state}` };
}

/** Estados em que automação (bot/IA) está pausada — útil para a UI. */
export function isAutomationPaused(state: ConversationState): boolean {
  return !canRespond("BOT", state).allowed && !canRespond("IA", state).allowed;
}

/**
 * A mensagem que chega deve continuar a conversa atual ou abrir uma nova?
 * Nova conversa quando a anterior foi finalizada, ou quando ficou em silêncio
 * além da janela de inatividade — é isso que impede o menu de boas-vindas de
 * ser reenviado a cada mensagem.
 */
export function shouldOpenNewConversation(params: {
  state: ConversationState;
  lastMessageAt: Date;
  now: Date;
  inactivityWindowMinutes: number;
}): boolean {
  if (params.state === "FINALIZADO") return true;
  const minutos = (params.now.getTime() - params.lastMessageAt.getTime()) / 60_000;
  return minutos > params.inactivityWindowMinutes;
}
