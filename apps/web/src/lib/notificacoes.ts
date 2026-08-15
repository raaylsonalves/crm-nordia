"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Aviso de mensagem nova: notificação do sistema quando a aba está em segundo
 * plano, som curto, e contador no título. Sem isso o atendente só descobre a
 * mensagem se estiver olhando a tela.
 */
export function useNotificacoes() {
  const contexto = useRef<AudioContext | null>(null);
  const tituloBase = useRef<string>("");

  useEffect(() => {
    tituloBase.current = document.title;
    // A permissão só é pedida uma vez; negada, o resto (som e título) continua.
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  /** Bipe sintetizado: evita depender de arquivo de áudio externo. */
  const tocar = useCallback(() => {
    try {
      contexto.current ??= new AudioContext();
      const ctx = contexto.current;
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.frequency.value = 880;
      ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
      ganho.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // Navegador que exige interação antes de tocar áudio: silêncio é aceitável.
    }
  }, []);

  const avisar = useCallback(
    (contato: string, texto: string) => {
      tocar();

      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(`Nova mensagem de ${contato}`, {
          body: texto.slice(0, 120),
          tag: "crm-rise",
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    },
    [tocar],
  );

  const marcarTitulo = useCallback((pendentes: number) => {
    document.title = pendentes > 0 ? `(${pendentes}) ${tituloBase.current}` : tituloBase.current;
  }, []);

  return { avisar, marcarTitulo };
}
