"use client";

import { API_URL, type Mensagem } from "@/lib/api";

/**
 * Renderiza a mídia da mensagem.
 *
 * A URL aponta para a NOSSA API, não para a WAHA: o arquivo lá exige chave de
 * API, que não pode chegar ao navegador. O back-end busca com a credencial e
 * devolve o conteúdo.
 */
export function Midia({ mensagem }: { mensagem: Mensagem }) {
  const src = `${API_URL}/messages/${mensagem.id}/media`;

  // Mídia não arquivada (mensagem anterior ao arquivamento, ou falha ao
  // guardar). Um aviso honesto vale mais que o ícone de imagem quebrada.
  if (!mensagem.temMidia) {
    const rotulo =
      mensagem.tipo === "IMAGE"
        ? "Imagem"
        : mensagem.tipo === "AUDIO"
          ? "Áudio"
          : mensagem.tipo === "VIDEO"
            ? "Vídeo"
            : "Arquivo";
    return (
      <div className="rounded-lg px-2.5 py-2 text-xs" style={{ background: "rgba(127,127,127,0.18)" }}>
        <span aria-hidden>⚠️</span> {rotulo} não disponível — o arquivo não chegou a ser arquivado.
      </div>
    );
  }

  if (mensagem.tipo === "IMAGE") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={mensagem.texto ?? "Imagem enviada na conversa"}
          className="max-h-72 w-auto rounded-lg"
          loading="lazy"
        />
      </a>
    );
  }

  if (mensagem.tipo === "AUDIO") {
    return <audio controls src={src} className="w-56" preload="none" />;
  }

  if (mensagem.tipo === "VIDEO") {
    return <video controls src={src} className="max-h-72 rounded-lg" preload="none" />;
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 underline"
    >
      <span aria-hidden>📎</span>
      {mensagem.texto ?? "Documento"}
    </a>
  );
}
