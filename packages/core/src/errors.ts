/** Erros de domínio e de integração — todos com código estável para log e UI. */

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A integração está em modo `disabled`. Lançado no lugar de qualquer resposta
 * fabricada: é isso que impede o sistema de parecer funcionando sem estar.
 */
export class IntegrationDisabledError extends AppError {
  constructor(provider: string) {
    super(
      "INTEGRATION_DISABLED",
      `Integração ${provider} não está configurada. Ative em Admin → Integrações.`,
      503,
    );
  }
}

/** Falha vinda do provedor externo (rede, 4xx, 5xx) após as retentativas. */
export class IntegrationError extends AppError {
  constructor(provider: string, operation: string, message: string, details?: unknown) {
    super("INTEGRATION_ERROR", `${provider}.${operation}: ${message}`, 502, details);
  }
}

/** A assinatura do webhook não confere. */
export class WebhookSignatureError extends AppError {
  constructor(provider: string) {
    super("WEBHOOK_SIGNATURE_INVALID", `Assinatura inválida no webhook ${provider}.`, 401);
  }
}

/** Ação bloqueada pela política de controle da conversa. */
export class ConversationLockedError extends AppError {
  constructor(reason: string) {
    super("CONVERSATION_LOCKED", reason, 409);
  }
}
