import { createHmac, timingSafeEqual } from "node:crypto";
import type { AckEvent, AckStatus, InboundMessage } from "@crm/core";

/** Envelope de webhook da WAHA. */
export interface WahaWebhookBody {
  id?: string;
  event?: string;
  session?: string;
  payload?: Record<string, unknown>;
}

/**
 * Confere o HMAC do webhook em tempo constante.
 * Sem segredo configurado devolve `false` — cabe ao chamador decidir se a
 * validação é obrigatória. Nunca "passa" por omissão silenciosa.
 *
 * A WAHA manda a assinatura no header `X-Webhook-Hmac` (hex, sem prefixo) e
 * o algoritmo em `X-Webhook-Hmac-Algorithm` — por padrão sha512, não sha256
 * como se poderia supor pela convenção mais comum (GitHub, Stripe etc.).
 * Confirmado inspecionando um payload real: ver docs/07-deploy-vercel.md.
 */
export function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
  algorithm: string = "sha512",
): boolean {
  if (!secret || !signature) return false;
  const esperado = createHmac(algorithm, secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(signature.replace(/^sha\d+=/, ""), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const TIPOS: Record<string, InboundMessage["type"]> = {
  chat: "TEXT",
  text: "TEXT",
  image: "IMAGE",
  audio: "AUDIO",
  ptt: "AUDIO",
  video: "VIDEO",
  document: "DOCUMENT",
  location: "LOCATION",
  sticker: "STICKER",
};

const ACKS: Record<number, AckStatus> = {
  [-1]: "FALHA",
  1: "ENVIADO",
  2: "ENTREGUE",
  3: "LIDO",
  4: "LIDO",
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Deduz o tipo pelo mime quando a WAHA não informa `type`. */
function tipoPeloMime(mime: string | undefined): InboundMessage["type"] {
  if (!mime) return "TEXT";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  return "DOCUMENT";
}

/** Converte o payload bruto em mensagem de entrada. Devolve null se não for uma. */
export function parseInboundMessage(body: WahaWebhookBody): InboundMessage | null {
  if (body.event !== "message") return null;
  const p = body.payload;
  if (!p) return null;

  const externalId = asString(p["id"]);
  const chatId = asString(p["from"]);
  if (!externalId || !chatId) return null;

  const tipoBruto = asString(p["type"]) ?? "chat";
  const mediaObj = p["media"] as Record<string, unknown> | undefined;
  const mimeDaMidia = asString(mediaObj?.["mimetype"]) ?? asString(p["mimetype"]);
  const media = p["media"] as Record<string, unknown> | undefined;
  const timestamp = typeof p["timestamp"] === "number" ? new Date(p["timestamp"] * 1000) : new Date();

  const mediaUrl = asString(media?.["url"]);
  const mediaMime = asString(media?.["mimetype"]);
  const dados = p["_data"] as Record<string, unknown> | undefined;
  const pushName = asString(dados?.["notifyName"]) ?? asString(p["notifyName"]);
  const caption = asString(p["caption"]);
  const corpo = asString(p["body"]);

  // O WhatsApp entrega, junto da mensagem real, eventos de protocolo sem corpo
  // e sem mídia (chaves de criptografia, sincronização de dispositivo). Tratá-los
  // como mensagem do cliente fazia o bot responder duas vezes e queimar o
  // contador de tentativas de intenção.
  if (!corpo && !mediaUrl && tipoBruto === "chat") return null;

  // O mime da mídia manda no tipo, sempre que existir.
  //
  // A WAHA às vezes não envia `type` (nulo ou vazio) em mensagem de mídia, e o
  // valor padrão "chat" mapeava para TEXT — a foto do cliente entrava como
  // texto e não era renderizada. Havendo mídia, o mime é a fonte confiável;
  // `type` só decide quando não há mídia nenhuma.
  const tipo = mimeDaMidia ? tipoPeloMime(mimeDaMidia) : (TIPOS[tipoBruto] ?? "TEXT");

  return {
    externalId,
    chatId,
    from: chatId,
    fromMe: p["fromMe"] === true,
    type: tipo,
    timestamp,
    session: body.session ?? "default",
    ...(pushName ? { pushName } : {}),
    ...(corpo ? { body: corpo } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(mediaMime ? { mediaMimeType: mediaMime } : {}),
    ...(caption ? { caption } : {}),
  };
}

/** Converte evento de confirmação (enviado/entregue/lido). */
export function parseAck(body: WahaWebhookBody): AckEvent | null {
  if (body.event !== "message.ack") return null;
  const p = body.payload;
  if (!p) return null;

  const externalId = asString(p["id"]);
  const ack = typeof p["ack"] === "number" ? p["ack"] : undefined;
  if (!externalId || ack === undefined) return null;

  const status = ACKS[ack];
  if (!status) return null;

  return { externalId, status, timestamp: new Date() };
}

/**
 * Identificador do evento para idempotência. A WAHA nem sempre manda `id` no
 * envelope, então caímos para o id da mensagem + evento — o par que de fato
 * identifica a entrega.
 */
export function eventId(body: WahaWebhookBody): string | null {
  if (body.id) return body.id;
  const idPayload = asString(body.payload?.["id"]);
  if (idPayload && body.event) return `${body.event}:${idPayload}`;
  return null;
}
