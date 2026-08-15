"use client";

import { useEffect, useState } from "react";
import { api, type Fila } from "@/lib/api";

/** Transferência para outro setor, com motivo obrigatório. */
export function Transferir({
  aberto,
  filaAtualId,
  onTransferir,
  onCancelar,
}: {
  aberto: boolean;
  filaAtualId: string | null;
  onTransferir: (filaId: string, motivo: string) => void;
  onCancelar: () => void;
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [filaId, setFilaId] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!aberto) return;
    api
      .get<Fila[]>("/queues")
      .then(setFilas)
      .catch(() => setFilas([]));
    setMotivo("");
    setFilaId("");
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onCancelar();
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  // Motivo é obrigatório: quem receber a conversa precisa saber por que ela chegou.
  const podeEnviar = filaId !== "" && motivo.trim().length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancelar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transferir-titulo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border p-5 shadow-xl"
        style={{ background: "var(--superficie)", borderColor: "var(--borda)" }}
      >
        <h2 id="transferir-titulo" className="text-base font-semibold">
          Transferir atendimento
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          A conversa volta para a fila do setor escolhido e deixa de ser sua.
        </p>

        <label htmlFor="setor" className="mb-1.5 mt-4 block text-sm font-medium">
          Setor
        </label>
        <select
          id="setor"
          value={filaId}
          onChange={(e) => setFilaId(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--fundo)", borderColor: "var(--borda)", color: "var(--texto)" }}
        >
          <option value="">Selecione…</option>
          {(filas ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.id === filaAtualId ? " (atual)" : ""}
            </option>
          ))}
        </select>

        <label htmlFor="motivo" className="mb-1.5 mt-4 block text-sm font-medium">
          Motivo
        </label>
        <textarea
          id="motivo"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: cliente quer trocar tamanho, precisa do setor de trocas"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--fundo)", borderColor: "var(--borda)", color: "var(--texto)" }}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancelar} className="rounded-lg border px-3.5 py-2 text-sm" style={{ borderColor: "var(--borda)" }}>
            Cancelar
          </button>
          <button
            onClick={() => onTransferir(filaId, motivo.trim())}
            disabled={!podeEnviar}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--acento)" }}
          >
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
