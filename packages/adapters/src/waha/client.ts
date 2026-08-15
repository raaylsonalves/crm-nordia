import {
  IntegrationDisabledError,
  type IntegrationMode,
  type OutgoingMedia,
  type OutgoingText,
  type SendResult,
  type SessionStatus,
  type WhatsappPort,
} from "@crm/core";
import { HttpClient, type LogEntry } from "../shared/http.js";

export interface WahaConfig {
  mode: IntegrationMode;
  baseUrl: string;
  apiKey: string;
  session: string;
  timeoutMs?: number;
  maxRetries?: number;
  onLog?: (entry: LogEntry) => void;
}

interface WahaSendResponse {
  id?: string | { id?: string; _serialized?: string };
  _data?: { id?: { _serialized?: string } };
  timestamp?: number;
}

/** Extrai o id da mensagem — a WAHA varia o formato conforme a engine. */
function extrairId(resposta: WahaSendResponse): string {
  const id = resposta.id;
  if (typeof id === "string") return id;
  if (id && typeof id === "object") {
    if (id._serialized) return id._serialized;
    if (id.id) return id.id;
  }
  if (resposta._data?.id?._serialized) return resposta._data.id._serialized;
  throw new Error("resposta da WAHA sem id de mensagem");
}

export class WahaAdapter implements WhatsappPort {
  readonly provider = "WAHA";
  readonly mode: IntegrationMode;
  private readonly http: HttpClient;
  private readonly session: string;

  constructor(private readonly config: WahaConfig) {
    this.mode = config.mode;
    this.session = config.session;
    this.http = new HttpClient({
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      headers: { "X-Api-Key": config.apiKey },
      timeoutMs: config.timeoutMs ?? 15_000,
      maxRetries: config.maxRetries ?? 3,
      ...(config.onLog ? { onAttempt: config.onLog } : {}),
    });
  }

  /**
   * Modo `disabled` lança erro em vez de devolver sucesso fabricado.
   * É a diferença entre "não configurado" e "parece que funcionou".
   */
  private garantirAtivo(): void {
    if (this.mode === "disabled") throw new IntegrationDisabledError(this.provider);
  }

  async sendText(message: OutgoingText): Promise<SendResult> {
    this.garantirAtivo();
    const resposta = await this.http.request<WahaSendResponse>("sendText", "POST", "/api/sendText", {
      session: this.session,
      chatId: message.chatId,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    });
    return {
      externalId: extrairId(resposta),
      timestamp: resposta.timestamp ? new Date(resposta.timestamp * 1000) : new Date(),
    };
  }

  async sendMedia(message: OutgoingMedia): Promise<SendResult> {
    this.garantirAtivo();
    const ehImagem = message.mimeType.startsWith("image/");
    const ehAudio = message.mimeType.startsWith("audio/");
    const endpoint = ehImagem ? "/api/sendImage" : ehAudio ? "/api/sendVoice" : "/api/sendFile";

    const resposta = await this.http.request<WahaSendResponse>("sendMedia", "POST", endpoint, {
      session: this.session,
      chatId: message.chatId,
      file: {
        mimetype: message.mimeType,
        filename: message.filename,
        ...(message.url ? { url: message.url } : { data: message.base64 }),
      },
      ...(message.caption ? { caption: message.caption } : {}),
    });
    return {
      externalId: extrairId(resposta),
      timestamp: resposta.timestamp ? new Date(resposta.timestamp * 1000) : new Date(),
    };
  }

  async baixarMidia(url: string): Promise<{ conteudo: Buffer; mimeType: string }> {
    this.garantirAtivo();

    // A URL vem do próprio provedor; só aceitamos as que apontam para a base
    // configurada, para o CRM não virar um proxy de download arbitrário.
    const base = this.config.baseUrl.replace(/\/$/, "");
    if (!url.startsWith(base)) {
      throw new Error(`URL de mídia fora do host da WAHA: ${url}`);
    }

    const resposta = await fetch(url, { headers: { "X-Api-Key": this.config.apiKey } });
    if (!resposta.ok) {
      throw new Error(`falha ao baixar mídia (HTTP ${resposta.status})`);
    }

    return {
      conteudo: Buffer.from(await resposta.arrayBuffer()),
      mimeType: resposta.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async markAsRead(chatId: string): Promise<void> {
    this.garantirAtivo();
    await this.http.request("markAsRead", "POST", `/api/${this.session}/chats/${encodeURIComponent(chatId)}/messages/read`, {});
  }

  async getSessionStatus(): Promise<SessionStatus> {
    this.garantirAtivo();
    const resposta = await this.http.request<{ name?: string; status?: string; me?: { id?: string } }>(
      "getSessionStatus",
      "GET",
      `/api/sessions/${encodeURIComponent(this.session)}`,
    );
    const status = resposta.status ?? "UNKNOWN";
    return {
      session: resposta.name ?? this.session,
      status,
      connected: status === "WORKING",
      ...(resposta.me?.id ? { me: resposta.me.id } : {}),
    };
  }

  async restartSession(): Promise<void> {
    this.garantirAtivo();
    await this.http.request("restartSession", "POST", `/api/sessions/${encodeURIComponent(this.session)}/restart`, {});
  }

  /** Chama o provedor de verdade. Não existe caminho que devolva "ok" sem rede. */
  async healthCheck(): Promise<SessionStatus> {
    return this.getSessionStatus();
  }
}
