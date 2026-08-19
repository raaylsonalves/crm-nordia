"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EstadoBadge, EstadoVazio, Skeleton } from "@/components/Badges";
import { Confirmar } from "@/components/Confirmar";
import { Midia } from "@/components/Midia";
import { Transferir } from "@/components/Transferir";
import { VisualizadorImagem } from "@/components/VisualizadorImagem";
import { useNotificacoes } from "@/lib/notificacoes";
import {
  API_URL,
  REALTIME_MODE,
  ApiError,
  api,
  type ConversaDetalhe,
  type ConversaResumo,
  type Estado,
  type Mensagem,
  type Usuario,
} from "@/lib/api";

/**
 * Ordem por urgência, não pela máquina de estados: quem espera resposta vem
 * primeiro. "Em aberto" é o padrão — atendimento finalizado é histórico.
 */
const FILTROS: { rotulo: string; estado?: Estado; naoLidas?: boolean; dica: string }[] = [
  { rotulo: "Em aberto", dica: "Tudo que ainda precisa de alguma ação" },
  { rotulo: "Esperando você", estado: "AGUARDANDO_ATENDENTE", dica: "Cliente pediu atendimento humano" },
  { rotulo: "Não lidos", naoLidas: true, dica: "Com mensagens que você ainda não abriu" },
  { rotulo: "Comigo", estado: "ATENDIMENTO_HUMANO", dica: "Atendimentos que você assumiu" },
  { rotulo: "No automático", estado: "BOT", dica: "Bot conduzindo a triagem" },
  { rotulo: "Aguardando cliente", estado: "AGUARDANDO_CLIENTE", dica: "Você respondeu, falta o cliente" },
  { rotulo: "Finalizados", estado: "FINALIZADO", dica: "Histórico de atendimentos encerrados" },
];

const brl = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function InboxPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [filtro, setFiltro] = useState(0);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<"close" | "return-to-bot" | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [imagemAberta, setImagemAberta] = useState<{ src: string; descricao: string } | null>(null);
  // Abaixo do breakpoint lg, só uma coluna fica visível por vez — a tela é
  // estreita demais para as três lado a lado (era o que quebrava no celular:
  // as três colunas continuavam lado a lado e o conteúdo vazava da tela).
  // Em telas largas as classes `lg:` ignoram este estado e mostram as três.
  const [painelMobile, setPainelMobile] = useState<"lista" | "conversa" | "cliente">("lista");
  const arquivoRef = useRef<HTMLInputElement>(null);
  const { avisar, marcarTitulo } = useNotificacoes();
  const [enviando, setEnviando] = useState(false);
  const fimDaLista = useRef<HTMLDivElement>(null);

  // ── Carregamento ───────────────────────────────────────────────────────
  const carregarConversas = useCallback(async () => {
    const f = FILTROS[filtro]!;
    const params = new URLSearchParams();
    if (f.estado) params.set("estado", f.estado);
    if (f.naoLidas) params.set("naoLidas", "true");
    if (busca.trim()) params.set("busca", busca.trim());
    try {
      setConversas(await api.get<ConversaResumo[]>(`/conversations?${params}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push("/login");
    }
  }, [filtro, busca, router]);

  const carregarConversa = useCallback(async (id: string) => {
    const [d, m] = await Promise.all([
      api.get<ConversaDetalhe>(`/conversations/${id}`),
      api.get<Mensagem[]>(`/conversations/${id}/messages`),
    ]);
    setDetalhe(d);
    setMensagens(m);
    await api.post(`/conversations/${id}/read`).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<Usuario>("/auth/me")
      .then(setUsuario)
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    void carregarConversas();
  }, [carregarConversas]);

  useEffect(() => {
    if (selecionada) void carregarConversa(selecionada);
  }, [selecionada, carregarConversa]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // ── Tempo real ─────────────────────────────────────────────────────────
  // Variante Vercel (sem API dedicada, ver REALTIME_MODE): sem SSE, uma
  // function serverless não sustenta conexão aberta. Reconsulta a lista a
  // cada poucos segundos — mais grosseiro, mas robusto nesse ambiente. Não é
  // o desenho final; é o suficiente para testar o fluxo.
  useEffect(() => {
    if (!usuario || REALTIME_MODE !== "poll") return;
    const intervalo = setInterval(() => {
      void carregarConversas();
      if (selecionada) void carregarConversa(selecionada);
    }, 4_000);
    return () => clearInterval(intervalo);
  }, [usuario, selecionada, carregarConversas, carregarConversa]);

  useEffect(() => {
    if (!usuario || REALTIME_MODE !== "sse") return;
    const fonte = new EventSource(`${API_URL}/stream`, { withCredentials: true });

    const aoReceber = (evento: MessageEvent) => {
      const dados = JSON.parse(evento.data) as { conversationId: string };
      void carregarConversas();
      // Só recarrega a conversa aberta — evita puxar histórico que ninguém vê.
      if (dados.conversationId === selecionada) void carregarConversa(dados.conversationId);
    };

    const aoReceberMensagem = (evento: MessageEvent) => {
      const dados = JSON.parse(evento.data) as {
        conversationId: string;
        dados?: { quem?: string; texto?: string; contato?: string };
      };
      // Só avisa sobre mensagem do cliente: eco da própria resposta não é aviso.
      if (dados.dados?.quem === "CLIENTE") {
        avisar(dados.dados.contato ?? "cliente", dados.dados.texto ?? "Nova mensagem");
      }
      aoReceber(evento);
    };

    fonte.addEventListener("message.created", aoReceberMensagem);
    fonte.addEventListener("conversation.updated", aoReceber);
    fonte.addEventListener("conversation.assigned", aoReceber);
    return () => fonte.close();
  }, [usuario, selecionada, carregarConversas, carregarConversa, avisar]);

  // Contador no título da aba, para quem está em outra janela.
  useEffect(() => {
    marcarTitulo((conversas ?? []).reduce((soma, c) => soma + c.naoLidas, 0));
  }, [conversas, marcarTitulo]);

  // ── Ações ──────────────────────────────────────────────────────────────
  const CONFIRMACAO: Record<string, string> = {
    assume: "Atendimento assumido. O cliente foi avisado no WhatsApp.",
    "wait-customer": "Marcado como aguardando o cliente.",
    "return-to-bot": "Devolvido para a automação.",
    close: "Atendimento finalizado.",
  };

  async function acao(nome: string, corpo?: unknown) {
    if (!selecionada) return;
    setErro(null);
    setAviso(null);
    try {
      await api.post(`/conversations/${selecionada}/${nome}`, corpo);
      await Promise.all([carregarConversa(selecionada), carregarConversas()]);
      setAviso(CONFIRMACAO[nome] ?? "Pronto.");
      setTimeout(() => setAviso(null), 4000);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível concluir a ação.");
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionada || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/conversations/${selecionada}/messages`, { texto: texto.trim() });
      setTexto("");
      await carregarConversa(selecionada);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !selecionada) return;
    e.target.value = ""; // permite reenviar o mesmo arquivo depois

    if (arquivo.size > 16 * 1024 * 1024) {
      setErro("Arquivo acima de 16 MB — o WhatsApp não aceita.");
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      await api.upload(`/conversations/${selecionada}/media`, arquivo, texto.trim() || undefined);
      setTexto("");
      await carregarConversa(selecionada);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function transferir(filaId: string, motivo: string) {
    setTransferindo(false);
    if (!selecionada) return;
    setErro(null);
    try {
      await api.post(`/conversations/${selecionada}/transfer`, { filaId, motivo });
      await Promise.all([carregarConversa(selecionada), carregarConversas()]);
      setAviso("Atendimento transferido.");
      setTimeout(() => setAviso(null), 4000);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível transferir.");
    }
  }

  async function sair() {
    await api.post("/auth/logout").catch(() => {});
    router.push("/login");
  }

  function alternarTema() {
    const escuro = document.documentElement.classList.toggle("dark");
    localStorage.setItem("tema", escuro ? "escuro" : "claro");
  }

  const borda = { borderColor: "var(--borda)" };
  const superficie = { background: "var(--superficie)" };

  const CONFIRMACOES = {
    close: {
      titulo: "Finalizar este atendimento?",
      descricao:
        "O atendimento sai da lista de abertos e vira histórico. Se o cliente escrever de novo, abre um atendimento novo com outro protocolo.",
      rotulo: "Finalizar",
      destrutivo: true,
      corpo: { motivo: "resolvido" } as unknown,
    },
    "return-to-bot": {
      titulo: "Devolver para a automação?",
      descricao: "Você deixa de ser responsável e o bot volta a conduzir a conversa.",
      rotulo: "Devolver",
      destrutivo: false,
      corpo: undefined as unknown,
    },
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Topo */}
      <header className="flex items-center gap-2 border-b px-3 py-3 sm:gap-4 sm:px-5" style={{ ...borda, ...superficie }}>
        <span className="shrink-0 text-lg font-bold tracking-[0.15em]">NORDIA</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar conversas"
          className="min-w-0 max-w-md flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
          style={{ ...borda, background: "var(--fundo)", color: "var(--texto)" }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <button onClick={alternarTema} aria-label="Alternar tema" className="rounded-lg border px-2.5 py-1.5 text-sm" style={borda}>
            ◐
          </button>
          <span className="hidden text-sm sm:inline" style={{ color: "var(--texto-suave)" }}>
            {usuario?.nome ?? "…"}
          </span>
          <button onClick={sair} className="text-sm underline" style={{ color: "var(--texto-suave)" }}>
            Sair
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Coluna 1 — lista. No celular, só aparece com painelMobile "lista". */}
        <aside
          className={`${painelMobile === "lista" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r lg:flex lg:w-80`}
          style={{ ...borda, ...superficie }}
        >
          <div className="flex flex-wrap gap-1.5 border-b p-3" style={borda}>
            {FILTROS.map((f, i) => (
              <button
                key={f.rotulo}
                onClick={() => setFiltro(i)}
                title={f.dica}
                aria-pressed={filtro === i}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition"
                style={
                  filtro === i
                    ? { background: "var(--acento)", color: "#fff" }
                    : { background: "var(--fundo)", color: "var(--texto-suave)" }
                }
              >
                {f.rotulo}
              </button>
            ))}
            <p className="mt-1 w-full text-[11px]" style={{ color: "var(--texto-suave)" }}>
              {FILTROS[filtro]!.dica}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversas === null ? (
              <div className="space-y-3 p-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : conversas.length === 0 ? (
              <EstadoVazio titulo="Nenhuma conversa" descricao="Nada por aqui com os filtros atuais." />
            ) : (
              conversas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelecionada(c.id);
                    setPainelMobile("conversa");
                  }}
                  className="w-full border-b px-4 py-3 text-left transition hover:opacity-80"
                  style={{
                    ...borda,
                    background: selecionada === c.id ? "var(--fundo)" : "transparent",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.contato.nome}</span>
                    <span className="shrink-0 text-xs" style={{ color: "var(--texto-suave)" }}>
                      {hora(c.ultimaMensagem)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                    {c.previa ?? "Sem mensagens"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <EstadoBadge estado={c.estado} texto={c.controlePor} />
                    {c.naoLidas > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ background: "var(--acento)" }}
                      >
                        {c.naoLidas}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Coluna 2 — conversa. No celular, só aparece com painelMobile "conversa". */}
        <section className={`${painelMobile === "conversa" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>
          {!detalhe ? (
            <EstadoVazio titulo="Selecione uma conversa" descricao="Escolha um atendimento na lista ao lado para ver o histórico." />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-5 py-3" style={{ ...borda, ...superficie }}>
                <button
                  onClick={() => setPainelMobile("lista")}
                  aria-label="Voltar para a lista"
                  className="shrink-0 rounded-lg px-2 py-1.5 text-lg lg:hidden"
                >
                  ←
                </button>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{detalhe.contato.nome}</p>
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    #{detalhe.protocolo} · {detalhe.fila?.nome ?? "sem fila"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <EstadoBadge estado={detalhe.estado} texto={detalhe.controlePor} />
                  {detalhe.estado !== "ATENDIMENTO_HUMANO" && detalhe.estado !== "FINALIZADO" && (
                    <button
                      onClick={() => acao("assume")}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ background: "var(--acento)" }}
                    >
                      Assumir
                    </button>
                  )}
                  <button
                    onClick={() => setPainelMobile("cliente")}
                    aria-label="Ver dados do cliente"
                    title="Ver dados do cliente"
                    className="shrink-0 rounded-lg border px-2 py-1.5 text-sm lg:hidden"
                    style={borda}
                  >
                    👤
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {mensagens === null ? (
                  <Skeleton className="h-20 w-2/3" />
                ) : (
                  mensagens.map((m) => {
                    const doCliente = m.quem === "CLIENTE";
                    return (
                      <div key={m.id} className={`flex ${doCliente ? "justify-start" : "justify-end"}`}>
                        <div
                          className="max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm"
                          style={{
                            background: doCliente ? "var(--superficie)" : "var(--acento)",
                            color: doCliente ? "var(--texto)" : "#fff",
                            border: doCliente ? "1px solid var(--borda)" : "none",
                          }}
                        >
                          {m.tipo !== "TEXT" && (
                            <div className="mb-1.5">
                              <Midia
                                mensagem={m}
                                onAbrirImagem={(src, descricao) => setImagemAberta({ src, descricao })}
                              />
                            </div>
                          )}
                          {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                          <p className="mt-1 text-[10px] opacity-70">
                            {m.quem === "ATENDENTE" ? (m.autor ?? "Atendente") : m.quem} · {hora(m.em)}
                            {m.status === "FALHA" && " · falhou"}
                          </p>
                          {m.erro && (
                            <p className="mt-1 rounded bg-black/20 px-2 py-1 text-[10px]">{m.erro}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={fimDaLista} />
              </div>

              {erro && (
                <p role="alert" className="mx-5 mb-2 rounded-lg px-3 py-2 text-sm" style={{ background: "#fdecea", color: "#a13b2e" }}>
                  {erro}
                </p>
              )}
              {aviso && (
                <p role="status" className="mx-5 mb-2 rounded-lg px-3 py-2 text-sm" style={{ background: "#e8f5e9", color: "#1b5e20" }}>
                  {aviso}
                </p>
              )}

              <form onSubmit={enviar} className="flex items-center gap-2 border-t px-4 py-3" style={{ ...borda, ...superficie }}>
                <input
                  ref={arquivoRef}
                  type="file"
                  className="hidden"
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  onChange={enviarArquivo}
                />
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={!detalhe.podeResponder || enviando}
                  aria-label="Anexar arquivo"
                  title="Anexar foto, áudio ou documento"
                  className="rounded-lg border px-2.5 py-2 text-sm disabled:opacity-40"
                  style={borda}
                >
                  📎
                </button>
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={detalhe.podeResponder ? "Escreva sua resposta…" : "Conversa bloqueada neste estado"}
                  disabled={!detalhe.podeResponder || enviando}
                  aria-label="Mensagem"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50"
                  style={{ ...borda, background: "var(--fundo)", color: "var(--texto)" }}
                />
                <button
                  type="submit"
                  disabled={!detalhe.podeResponder || enviando || !texto.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--acento)" }}
                >
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </form>
            </>
          )}
        </section>

        {/* Coluna 3 — cliente. No celular, só aparece com painelMobile "cliente". */}
        {detalhe && (
          <aside
            className={`${painelMobile === "cliente" ? "block" : "hidden"} w-full shrink-0 overflow-y-auto border-l p-5 lg:block lg:w-72`}
            style={{ ...borda, ...superficie }}
          >
            <button
              onClick={() => setPainelMobile("conversa")}
              className="mb-4 flex items-center gap-1.5 text-sm lg:hidden"
              style={{ color: "var(--texto-suave)" }}
            >
              ← Voltar à conversa
            </button>
            <p className="text-sm font-semibold">{detalhe.contato.nome}</p>
            <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
              {detalhe.contato.telefone ?? "telefone não informado pelo WhatsApp"}
            </p>

            {detalhe.contato.etiquetas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detalhe.contato.etiquetas.map((t) => (
                  <span key={t.nome} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: t.cor }}>
                    {t.nome}
                  </span>
                ))}
              </div>
            )}

            <dl className="mt-5 space-y-2 text-xs">
              <Linha rotulo="Origem" valor={detalhe.contato.origem} />
              <Linha rotulo="Tamanho" valor={detalhe.contato.tamanho} />
              <Linha rotulo="Estilo" valor={detalhe.contato.estilo} />
              <Linha rotulo="Pedidos" valor={String(detalhe.contato.pedidos)} />
              <Linha rotulo="Total gasto" valor={brl(detalhe.contato.totalGasto)} />
              <Linha rotulo="Ticket médio" valor={brl(detalhe.contato.ticketMedio)} />
            </dl>

            {detalhe.anteriores.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
                  Atendimentos anteriores ({detalhe.anteriores.length})
                </p>
                <div className="space-y-1.5">
                  {detalhe.anteriores.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelecionada(a.id);
                        setPainelMobile("conversa");
                      }}
                      className="w-full rounded-lg border px-2.5 py-2 text-left text-xs transition hover:opacity-80"
                      style={borda}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">#{a.protocolo}</span>
                        <span style={{ color: "var(--texto-suave)" }}>
                          {new Date(a.abertoEm).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="mt-0.5" style={{ color: "var(--texto-suave)" }}>
                        {a.estado === "FINALIZADO" ? `Encerrado — ${a.motivo ?? "sem motivo"}` : "Em andamento"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detalhe.handoff && (
              <div className="mt-5 rounded-lg border p-3 text-xs" style={borda}>
                <p className="font-semibold">Motivo da transferência</p>
                <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
                  {detalhe.handoff.reason}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <Acao rotulo="Transferir para outro setor" onClick={() => setTransferindo(true)} />
              <Acao rotulo="Aguardar cliente" onClick={() => acao("wait-customer")} />
              <Acao rotulo="Devolver para automação" onClick={() => setConfirmando("return-to-bot")} />
              <Acao rotulo="Finalizar atendimento" destaque onClick={() => setConfirmando("close")} />
            </div>
          </aside>
        )}
      </div>

      <VisualizadorImagem
        src={imagemAberta?.src ?? null}
        descricao={imagemAberta?.descricao ?? ""}
        onFechar={() => setImagemAberta(null)}
      />

      <Transferir
        aberto={transferindo}
        filaAtualId={detalhe?.fila?.id ?? null}
        onTransferir={transferir}
        onCancelar={() => setTransferindo(false)}
      />

      <Confirmar
        aberto={confirmando !== null}
        titulo={confirmando ? CONFIRMACOES[confirmando].titulo : ""}
        descricao={confirmando ? CONFIRMACOES[confirmando].descricao : ""}
        rotuloConfirmar={confirmando ? CONFIRMACOES[confirmando].rotulo : ""}
        destrutivo={confirmando ? CONFIRMACOES[confirmando].destrutivo : false}
        onCancelar={() => setConfirmando(null)}
        onConfirmar={() => {
          const acaoEscolhida = confirmando!;
          setConfirmando(null);
          void acao(acaoEscolhida, CONFIRMACOES[acaoEscolhida].corpo);
        }}
      />
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--texto-suave)" }}>{rotulo}</dt>
      <dd className="text-right font-medium">{valor ?? "—"}</dd>
    </div>
  );
}

function Acao({ rotulo, onClick, destaque }: { rotulo: string; onClick: () => void; destaque?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border px-3 py-2 text-sm transition hover:opacity-80"
      style={{
        borderColor: destaque ? "#c2410c" : "var(--borda)",
        color: destaque ? "#c2410c" : "var(--texto)",
      }}
    >
      {rotulo}
    </button>
  );
}
