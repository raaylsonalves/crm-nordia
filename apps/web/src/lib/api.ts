/**
 * Cliente da API. Todas as chamadas levam o cookie de sessão (`credentials`).
 * Nenhuma credencial de WAHA, IA ou loja passa por aqui — o navegador só
 * conhece a nossa própria API.
 *
 * Duas formas de hospedar, mesmo front:
 *  - Local/produção "cheia": API separada em Fastify (apps/api), com SSE de
 *    verdade. NEXT_PUBLIC_API_URL aponta para ela.
 *  - Vercel (teste): sem NEXT_PUBLIC_API_URL, cai em "/api/v1" — rotas do
 *    próprio Next.js (apps/web/src/app/api/v1/**), mesma origem. Essa variante
 *    não tem SSE (function serverless não sustenta conexão longa), então a
 *    inbox usa polling — ver REALTIME_MODE.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

/** "sse" quando há API externa dedicada; "poll" na variante Vercel. */
export const REALTIME_MODE: "sse" | "poll" = process.env.NEXT_PUBLIC_API_URL ? "sse" : "poll";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new ApiError(
      resposta.status,
      corpo?.error?.code ?? "ERRO",
      corpo?.error?.message ?? "Não foi possível completar a ação.",
    );
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

export const api = {
  get: <T>(caminho: string) => request<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    request<T>(caminho, { method: "POST", body: corpo ? JSON.stringify(corpo) : undefined }),

  /** Upload de mídia. Sem Content-Type: o navegador define o boundary. */
  async upload<T>(caminho: string, arquivo: File, legenda?: string): Promise<T> {
    const dados = new FormData();
    dados.append("file", arquivo);
    if (legenda) dados.append("caption", legenda);

    const resposta = await fetch(`${API_URL}${caminho}`, {
      method: "POST",
      credentials: "include",
      body: dados,
    });

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      throw new ApiError(resposta.status, corpo?.error?.code ?? "ERRO", corpo?.error?.message ?? "Falha no envio.");
    }
    return resposta.json() as Promise<T>;
  },
};

export interface Fila {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

// ── Tipos ────────────────────────────────────────────────────────────────
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMINISTRADOR" | "SUPERVISOR" | "ATENDENTE";
  filas: { id: string; name: string; color: string }[];
}

export type Estado =
  | "BOT"
  | "IA"
  | "AGUARDANDO_ATENDENTE"
  | "ATENDIMENTO_HUMANO"
  | "AGUARDANDO_CLIENTE"
  | "FINALIZADO";

export interface ConversaResumo {
  id: string;
  protocolo: string;
  contato: { id: string; nome: string; telefone: string | null };
  estado: Estado;
  etapa: string;
  fila: { id: string; name: string; color: string } | null;
  responsavel: { id: string; name: string } | null;
  naoLidas: number;
  controlePor: string;
  previa: string | null;
  ultimaMensagem: string;
}

export interface ConversaDetalhe {
  id: string;
  protocolo: string;
  estado: Estado;
  etapa: string;
  fila: { id: string; nome: string; cor: string } | null;
  responsavel: { id: string; name: string } | null;
  controlePor: string;
  podeResponder: boolean;
  handoff: { reason: string; summary: string | null } | null;
  anteriores: {
    id: string;
    protocolo: string;
    estado: Estado;
    abertoEm: string;
    fechadoEm: string | null;
    motivo: string | null;
  }[];
  contato: {
    id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    origem: string | null;
    tamanho: string | null;
    estilo: string | null;
    observacoes: string | null;
    etiquetas: { nome: string; cor: string }[];
    totalGasto: string;
    pedidos: number;
    ticketMedio: string;
    ultimaCompra: string | null;
  };
}

export interface Mensagem {
  id: string;
  quem: "CLIENTE" | "BOT" | "IA" | "ATENDENTE" | "SISTEMA";
  autor: string | null;
  direcao: "INBOUND" | "OUTBOUND";
  tipo: string;
  texto: string | null;
  temMidia: boolean;
  status: "PENDENTE" | "ENVIADO" | "ENTREGUE" | "LIDO" | "FALHA";
  erro: string | null;
  em: string;
}
