/**
 * Porta de WhatsApp. O domínio conhece só esta interface — nunca a WAHA.
 * Trocar de gateway depois é escrever outro adapter, não mexer no fluxo.
 */

export type IntegrationMode = "live" | "sandbox" | "disabled";

export interface OutgoingText {
  chatId: string;
  text: string;
  /** Id da mensagem citada, quando for resposta. */
  replyTo?: string;
}

export interface OutgoingMedia {
  chatId: string;
  /** URL acessível pelo gateway, ou conteúdo em base64. */
  url?: string;
  base64?: string;
  mimeType: string;
  filename: string;
  caption?: string;
}

export interface SendResult {
  /** Id atribuído pelo gateway — base da idempotência e do rastreio de status. */
  externalId: string;
  timestamp: Date;
}

export interface SessionStatus {
  session: string;
  /** STARTING, SCAN_QR_CODE, WORKING, FAILED, STOPPED… conforme o gateway. */
  status: string;
  connected: boolean;
  /** Número conectado, quando disponível. */
  me?: string;
}

export interface InboundMessage {
  externalId: string;
  chatId: string;
  from: string;
  fromMe: boolean;
  pushName?: string;
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "LOCATION" | "STICKER";
  body?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  caption?: string;
  timestamp: Date;
  session: string;
}

export type AckStatus = "ENVIADO" | "ENTREGUE" | "LIDO" | "FALHA";

export interface AckEvent {
  externalId: string;
  status: AckStatus;
  timestamp: Date;
}

export interface WhatsappPort {
  readonly provider: string;
  readonly mode: IntegrationMode;

  sendText(message: OutgoingText): Promise<SendResult>;
  sendMedia(message: OutgoingMedia): Promise<SendResult>;
  markAsRead(chatId: string): Promise<void>;
  getSessionStatus(): Promise<SessionStatus>;
  restartSession(): Promise<void>;
  /** Testa a conexão de verdade. Nunca devolve sucesso sem chamar o provedor. */
  healthCheck(): Promise<SessionStatus>;
}
