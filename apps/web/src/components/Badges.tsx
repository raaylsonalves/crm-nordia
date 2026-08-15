"use client";

import type { Estado } from "@/lib/api";

/**
 * Cor + rótulo, sempre. Status identificado só por cor exclui quem não
 * distingue as cores.
 */
const ESTILO: Record<Estado, { rotulo: string; cor: string; fundo: string }> = {
  BOT: { rotulo: "Bot", cor: "#2563eb", fundo: "#dbeafe" },
  IA: { rotulo: "IA", cor: "#7c3aed", fundo: "#ede9fe" },
  AGUARDANDO_ATENDENTE: { rotulo: "Na fila", cor: "#c2410c", fundo: "#ffedd5" },
  ATENDIMENTO_HUMANO: { rotulo: "Em atendimento", cor: "#15803d", fundo: "#dcfce7" },
  AGUARDANDO_CLIENTE: { rotulo: "Aguardando cliente", cor: "#6b7280", fundo: "#f3f4f6" },
  FINALIZADO: { rotulo: "Finalizado", cor: "#44403c", fundo: "#e7e5e4" },
};

export function EstadoBadge({ estado, texto }: { estado: Estado; texto?: string }) {
  const e = ESTILO[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: e.fundo, color: e.cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.cor }} aria-hidden />
      {texto ?? e.rotulo}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export function EstadoVazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
        style={{ background: "var(--borda)" }}
        aria-hidden
      >
        💬
      </div>
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="mt-1 max-w-xs text-sm" style={{ color: "var(--texto-suave)" }}>
        {descricao}
      </p>
    </div>
  );
}
