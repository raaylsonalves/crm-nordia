"use client";

import { useEffect } from "react";

/**
 * Visualizador de imagem em sobreposição, como no WhatsApp.
 *
 * Antes a foto abria numa nova página e o atendente precisava voltar pelo
 * navegador — perdendo a conversa de vista no meio do atendimento.
 */
export function VisualizadorImagem({
  src,
  descricao,
  onFechar,
}: {
  src: string | null;
  descricao: string;
  onFechar: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem do fundo enquanto a imagem está aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [src, onFechar]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={descricao}
      onClick={onFechar}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.88)" }}
    >
      <button
        onClick={onFechar}
        aria-label="Fechar imagem"
        className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-xl leading-none text-white"
        style={{ background: "rgba(255,255,255,0.14)" }}
      >
        ×
      </button>

      <a
        href={src}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 rounded-lg px-4 py-2 text-sm text-white"
        style={{ background: "rgba(255,255,255,0.14)" }}
      >
        Baixar imagem
      </a>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={descricao}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
