import { IntegrationError } from "@crm/core";

export interface HttpOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  maxRetries: number;
  /** Chamado a cada tentativa — alimenta integration_log. */
  onAttempt?: (info: LogEntry) => void;
}

export interface LogEntry {
  operation: string;
  method: string;
  path: string;
  statusCode?: number;
  success: boolean;
  durationMs: number;
  attempt: number;
  errorMessage?: string;
}

/** Só faz sentido repetir o que pode melhorar sozinho. 4xx não melhora. */
function valeRetentar(status?: number): boolean {
  if (status === undefined) return true; // rede/timeout
  if (status === 429) return true;
  return status >= 500;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpClient {
  constructor(private readonly options: HttpOptions) {}

  async request<T>(
    operation: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    let ultimoErro = "";
    let ultimoStatus: number | undefined;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      const inicio = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

      try {
        const resposta = await fetch(`${this.options.baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...this.options.headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        });

        const durationMs = Date.now() - inicio;
        ultimoStatus = resposta.status;

        if (resposta.ok) {
          this.options.onAttempt?.({ operation, method, path, statusCode: resposta.status, success: true, durationMs, attempt });
          const texto = await resposta.text();
          return (texto ? JSON.parse(texto) : undefined) as T;
        }

        ultimoErro = (await resposta.text().catch(() => "")).slice(0, 500) || resposta.statusText;
        this.options.onAttempt?.({ operation, method, path, statusCode: resposta.status, success: false, durationMs, attempt, errorMessage: ultimoErro });

        if (!valeRetentar(resposta.status)) break;
      } catch (error) {
        const durationMs = Date.now() - inicio;
        ultimoErro = error instanceof Error ? error.message : String(error);
        ultimoStatus = undefined;
        this.options.onAttempt?.({ operation, method, path, success: false, durationMs, attempt, errorMessage: ultimoErro });
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.options.maxRetries) {
        // Recuo exponencial com jitter, para não sincronizar retentativas.
        await espera(Math.min(2 ** attempt * 250, 5_000) + Math.random() * 250);
      }
    }

    throw new IntegrationError("WAHA", operation, ultimoErro || "falha desconhecida", {
      statusCode: ultimoStatus,
    });
  }
}
