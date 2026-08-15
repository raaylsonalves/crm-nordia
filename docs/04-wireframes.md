# Wireframes e componentes

Direção visual: neutra e elegante — areia (`#F5F1EA`), grafite (`#1C1B19`), terracota discreta como acento (`#B4654A`), tipografia moderna (Inter para interface, Fraunces para títulos). Cantos `rounded-xl`, sombras suaves, sem cores saturadas fora dos indicadores de status.

## 1. Caixa de entrada — desktop (≥1280px)

```
┌──┬───────────────────────────────────────────────────────────────────────────────┐
│  │  Buscar nome, telefone, pedido ou protocolo…            [🌙] [Ana Beatriz ▾]  │
│  ├──────────────────┬────────────────────────────────────┬───────────────────────┤
│▣ │ FILTROS          │  Juliana Prado   ·  #A7K2-4821     │  JULIANA PRADO        │
│  │ ▸ Novos       12 │  🟣 IA respondendo   [Assumir]     │  (11) 98765-4321      │
│💬│ ▸ Em triagem   4 │────────────────────────────────────│  juliana@email.com    │
│  │ ▸ Aguard. atend│                                      │  Origem: botão produto│
│▤ │              7 │  ┌ Juliana ─────────── 14:02 ┐       │  🏷 VIP · Vestidos    │
│  │ ▸ Em atendim.  9 │  │ Oi! O vestido midi tem  │       │─────────────────────  │
│👤│ ▸ Aguard. cliente│  │ no 40?                  │       │ PREFERÊNCIAS          │
│  │              3 │  └─────────────────────────┘       │ Tamanho M · 40        │
│📦│ ▸ Finalizados    │       ┌ IA ──────────── 14:02 ┐    │ Estilo: clássico      │
│  │ ▸ Não lidos    5 │       │ Temos sim! Midi     │    │─────────────────────  │
│📈│                  │       │ Linho, 40 em        │    │ COMPRAS               │
│  │ Fila: [Vendas ▾] │       │ estoque (3 un.),    │    │ 4 pedidos · R$ 1.284  │
│⚙ │ Atend.:[Todos ▾] │       │ R$ 289,90.          │    │ Ticket médio R$ 321   │
│  │ Etiqueta:[VIP ▾] │       │ 📚 3 trechos · 92%  │    │ Última: 12/07/2026    │
│  │──────────────────│       └─────────────────────┘    │─────────────────────  │
│  │ ● Juliana Prado  │                                    │ PEDIDO #1042  ENVIADO │
│  │   O vestido midi…│  ┌───────────────────────────────┐ │ Vestido Midi Linho M  │
│  │   14:02   🟣 IA  │  │ Escreva…      📎 🎤 ✨IA  [→] │ │ Rastreio BR8291…      │
│  │──────────────────│  └───────────────────────────────┘ │─────────────────────  │
│  │ ○ Marcos Vieira  │                                    │ [Transferir]          │
│  │   Trocar tamanho │  Etapa do funil: [Oportunidade ▾]  │ [Aguardar cliente]    │
│  │   13:41  🟠 Fila │                                    │ [Finalizar]           │
└──┴──────────────────┴────────────────────────────────────┴───────────────────────┘
```

- **Indicador de responsável**: 🔵 `BOT` · 🟣 `IA` · 🟠 `AGUARDANDO_ATENDENTE` · 🟢 `ATENDIMENTO_HUMANO` (com avatar) · ⚪ `AGUARDANDO_CLIENTE` · ⚫ `FINALIZADO`. Cor + rótulo textual, nunca cor sozinha.
- **Mensagens da IA** trazem rodapé com nº de trechos usados e confiança; clicar abre os trechos recuperados.
- **✨IA** no compositor gera sugestão que aparece como rascunho editável — nunca envia sozinha.
- Enquanto carrega: skeleton de 6 linhas na lista e 4 bolhas na conversa.

## 2. Tablet (768–1279px)
Duas colunas: lista + conversa. O painel do cliente vira uma gaveta lateral acionada pelo cabeçalho.

## 3. Celular (<768px)
Uma coluna por vez com navegação em pilha: Lista → Conversa → Cliente. Filtros em bottom sheet. Compositor fixo com teclado seguro.

## 4. Funil (Kanban)

```
┌ Novo ─┐┌ Triagem ┐┌ Oportun.┐┌ Aguard. ┐┌ Em atend.┐┌ Aguard.  ┐┌ Pedido ┐┌ Pós-  ┐┌ Final ┐
│  12   ││    4    ││    8    ││ atend. 7││    9     ││ pagam. 3 ││ feito 5││venda 2││  38   │
│┌─────┐││┌───────┐││┌───────┐││┌───────┐││┌────────┐││┌───────┐ ││        ││       ││       │
││Juli.││││Marcos ││││Renata ││││Camila ││││Bruno   ││││Aline  │ ││        ││       ││       │
││R$289││││Troca  ││││R$540  ││││#A7K2  ││││Ana B.  ││││Pix    │ ││        ││       ││       │
│└─────┘││└───────┘││└───────┘││└───────┘││└────────┘││└───────┘ ││        ││       ││       │
```
Arrastar move a conversa e dispara as automações da etapa. Cada coluna mostra contagem e soma de valor estimado. Drag também acessível por teclado (mover com setas após `Espaço`).

## 5. Integrações → WAHA

```
WAHA · WhatsApp                                  Modo: ● LIVE   [Testar conexão]
────────────────────────────────────────────────────────────────────────────────
URL da API      https://waha.minhaloja.com.br
Sessão          loja-principal            Estado: ● CONECTADO (número 55119…4321)
Chave de API    ••••••••••••4f9a          [Substituir]
Webhook         https://crm.minhaloja.com.br/api/v1/webhooks/waha
HMAC            ● configurado             Último webhook: há 12 s

EVENTOS RECENTES
14:02:11  message            5511987654321@c.us   ✔ processado
14:01:58  message.ack        DELIVERED            ✔ processado
13:59:02  session.status     WORKING              ✔ processado
13:47:20  message            5511991234567@c.us   ✖ falha: mídia expirada  [Reprocessar]
```
A chave nunca é devolvida pela API — só a dica dos 4 últimos caracteres. “Substituir” abre campo vazio.

## 6. Base de conhecimento

Lista de documentos com categoria, status de indexação (`PENDENTE`/`PROCESSANDO`/`INDEXADO`/`FALHA`), nº de trechos e data da última atualização. Painel de teste: pergunta → trechos recuperados com score e documento de origem → confiança estimada.

## 7. Dashboard

Linha de KPIs (conversas recebidas, novos contatos, em espera, TMPR, TMR, taxa de transferência IA→humano, % resolvidos pela automação), gráfico de volume por hora, funil de conversão, faturamento influenciado, tabela por atendente e nuvem das principais intenções.

## 8. Componentes principais

| Componente | Responsabilidade |
|---|---|
| `ConversationList` | Lista virtualizada, filtros, busca, não lidos |
| `MessageThread` | Histórico, agrupamento por dia, status de entrega, mídia |
| `Composer` | Texto, anexo, gravação de áudio, sugestão de IA, bloqueio por estado |
| `ControlBadge` | Quem responde agora (bot/IA/atendente) |
| `CustomerPanel` | Ficha, preferências, compras, pedido atual, ações |
| `AiSourcesPopover` | Trechos usados, documento, score, confiança |
| `KanbanBoard` | Colunas do funil com drag acessível |
| `AutomationBuilder` | Quando X · Se Y · Então Z |
| `IntegrationCard` | Modo, estado, teste de conexão, eventos |
| `ConfirmDialog` | Confirmação de finalizar, transferir, excluir, apagar dados |
| `EmptyState` / `SkeletonBlock` | Estados vazios ilustrados e carregamento |

## 9. Acessibilidade
Radix UI como base (foco visível, ESC, navegação por teclado, `aria-live` para mensagens novas), contraste mínimo AA nos dois temas, alvos de toque ≥44px, status sempre com rótulo textual além da cor.
