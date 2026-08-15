"use client";

import { useEffect, useRef } from "react";

/**
 * Diálogo de confirmação da própria aplicação.
 *
 * Substitui window.confirm, que o navegador pode bloquear, não recebe estilo,
 * não explica a consequência e trava a thread da página.
 */
export function Confirmar({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  destrutivo?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const confirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    confirmarRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancelar}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby="confirmar-descricao"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border p-5 shadow-xl"
        style={{ background: "var(--superficie)", borderColor: "var(--borda)" }}
      >
        <h2 id="confirmar-titulo" className="text-base font-semibold">
          {titulo}
        </h2>
        <p id="confirmar-descricao" className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          {descricao}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-lg border px-3.5 py-2 text-sm"
            style={{ borderColor: "var(--borda)" }}
          >
            Cancelar
          </button>
          <button
            ref={confirmarRef}
            onClick={onConfirmar}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
            style={{ background: destrutivo ? "#b3261e" : "var(--acento)" }}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
