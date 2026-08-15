# Arquitetura do Sistema — CRM Rise

CRM de atendimento para loja de roupas, integrado a WhatsApp (WAHA), Nuvemshop e um assistente de IA.

## 1. Visão geral

```
                    ┌────────────────────────────────────────────┐
   WhatsApp ──▶ WAHA ──webhook──▶ │  API Gateway (Fastify)                     │
   (cliente)      │   ◀──REST──── │   /webhooks/waha  /api/v1/*                │
                  │               └───────┬───────────────┬────────────────────┘
                  │                       │               │
                  │                 ┌─────▼─────┐   ┌─────▼──────┐
                  │                 │  Core     │   │ Realtime   │
                  │                 │  Services │   │ (SSE/WS)   │
                  │                 └─────┬─────┘   └─────┬──────┘
                  │                       │               │
   Nuvemshop ─webhook─▶ /webhooks/nuvemshop│               │
        ▲             ┌─────────────────────▼──────┐       │
        └──REST───────│  Adapters (portas/saídas)  │       │
                      │  WahaAdapter               │       │
                      │  NuvemshopAdapter          │       │
                      │  AiAdapter (LLM+embeddings)│       │
                      └─────────┬──────────────────┘       │
                                │                          │
        ┌───────────────────────▼──────────┐     ┌──────────▼──────────┐
        │ PostgreSQL 16 (+ pgvector)       │     │ Next.js 15 (App Dir) │
        │ Redis 7 (cache, filas, pub/sub)  │     │ Tailwind + Radix     │
        │ BullMQ workers (processo à parte)│     └──────────────────────┘
        └──────────────────────────────────┘
```

## 2. Princípios de arquitetura

1. **Hexagonal (ports & adapters).** O domínio (conversa, contato, fila, oportunidade) não conhece WAHA, Nuvemshop nem o provedor de IA. Cada integração implementa uma *porta* declarada em `packages/core/src/ports/`.
2. **Nada de mock disfarçado de produção.** Cada adapter tem três modos explícitos, controlados por `INTEGRATION_MODE`:
   - `live` — chama a API real;
   - `sandbox` — chama o ambiente de testes do provedor;
   - `disabled` — **falha de forma explícita** (`IntegrationDisabledError`) e o erro aparece na UI como “integração não configurada”. Nunca devolve resposta fabricada.
   Não existe modo que simule sucesso. A tela de integrações mostra o modo ativo em destaque.
3. **Segredos só no back-end.** O front-end nunca recebe token de WAHA, Nuvemshop ou IA. Chamadas passam sempre pela API própria. Segredos gravados no banco são cifrados com AES-256-GCM usando `ENCRYPTION_KEY`; a UI exibe apenas os 4 últimos caracteres.
4. **Idempotência em toda borda.** Webhooks gravam `(provider, event_id)` em `webhook_event` com unique constraint antes de qualquer efeito. Reentrega = no-op.
5. **Efeito colateral sempre por fila.** O handler de webhook só valida, persiste o evento e enfileira. Todo envio, chamada de IA e sincronização roda em worker BullMQ com retry exponencial e DLQ.
6. **Uma única fonte de verdade por dado.** Preço, estoque e variação **nunca** são inventados nem inferidos pela IA: vêm de `product_variant`, sincronizado da Nuvemshop, com `synced_at`. Se o dado estiver obsoleto além de `CATALOG_STALE_MINUTES`, consulta-se a API ao vivo.

## 3. Componentes

| Componente | Responsabilidade | Tecnologia |
|---|---|---|
| `apps/web` | UI (inbox, kanban, admin, dashboard) | Next.js 15, App Router, RSC + client islands |
| `apps/api` | REST + webhooks + SSE | Fastify 5, TypeScript, Zod |
| `apps/worker` | Jobs: envio, IA, sync, automações, agendamentos | BullMQ |
| `packages/core` | Domínio, casos de uso, portas | TypeScript puro, sem I/O |
| `packages/db` | Prisma schema, migrations, seed | Prisma + PostgreSQL 16 |
| `packages/adapters` | WAHA, Nuvemshop, IA, storage | fetch + undici, retry |
| `packages/ui` | Design system compartilhado | Tailwind + Radix UI |

## 4. Tempo real

SSE em `/api/v1/stream` (unidirecional server→cliente, mais simples e sobrevive a proxies). O cliente envia mensagens por POST normal. Fan-out entre instâncias por Redis Pub/Sub.

Canais por assinatura: `org:{orgId}`, `conversation:{id}`, `queue:{id}`, `user:{id}`.
Eventos: `message.created`, `message.status`, `conversation.updated`, `conversation.assigned`, `typing`, `integration.health`.

Autorização do stream: o token de sessão define quais canais o socket pode assinar; um atendente só recebe eventos de conversas das filas às quais pertence.

## 5. Máquina de estados da conversa

```
          ┌──────────────── nova mensagem (após INACTIVITY_WINDOW) ───────────────┐
          ▼                                                                        │
      [ BOT ] ──opção 1..4──▶ [ IA ] ──confiança baixa / pedido explícito──▶ [ AGUARDANDO_ATENDENTE ]
          │                     │                                                  │
          │ opção 5             │ resposta ok                                      │ atendente assume
          ▼                     ▼                                                  ▼
   [ AGUARDANDO_ATENDENTE ]  [ AGUARDANDO_CLIENTE ] ◀── aguardar cliente ── [ ATENDIMENTO_HUMANO ]
                                    │                                              │
                                    │ sem resposta > SLA                           │ finalizar
                                    ▼                                              ▼
                             [ FINALIZADO ] ◀────────────────────────────── [ FINALIZADO ]
```

Regra dura, aplicada num único ponto (`ConversationControl.canRespond(actor, conversation)`): em `AGUARDANDO_ATENDENTE`, `ATENDIMENTO_HUMANO` e `FINALIZADO` **nenhum** ator automático pode enviar mensagem. Bot e IA consultam essa função antes de qualquer envio; o worker revalida no momento do dispatch (a conversa pode ter mudado enquanto o job estava na fila).

Transições registradas em `conversation_event` (auditoria + métricas de tempo).

## 6. Pipeline da IA

```
mensagem → classificar (intenção, sentimento, prioridade)
        → recuperar contexto:
             • base de conhecimento (busca semântica pgvector, top-k=6, score mínimo)
             • catálogo Nuvemshop (produto/variação/estoque ao vivo)
             • histórico do contato (pedidos, tamanhos, últimas compras)
        → gerar resposta com ferramentas (tool calling):
             buscar_produto, consultar_estoque, consultar_pedido (exige validação),
             consultar_politica, transferir_para_humano
        → guardrails:
             • citação obrigatória: toda afirmação sobre política precisa de trecho recuperado
             • preço/estoque só de tool call, nunca do texto gerado
             • confiança < AI_CONFIDENCE_THRESHOLD → transfere
        → registrar ai_interaction (prompt, trechos, custo, latência, confiança)
```

Falta de informação confiável → resposta fixa: *“Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar.”* + transferência.

## 7. Segurança

- Sessão por cookie `httpOnly`, `Secure`, `SameSite=Lax`; JWT curto + refresh rotativo.
- RBAC por `role` + escopo de fila, avaliado em middleware e novamente na camada de caso de uso.
- Rate limit por IP e por usuário (Redis token bucket); webhooks com limite próprio e maior.
- HMAC SHA-256 nos webhooks WAHA (`X-Waha-Signature`) e validação de `Authentication` da Nuvemshop; comparação em tempo constante.
- Zod em toda entrada; sanitização de HTML antes de renderizar conteúdo vindo do WhatsApp.
- `audit_log` para toda ação sensível (assumir, transferir, exportar, apagar, alterar integração).
- LGPD: `consent`, retenção configurável (`MESSAGE_RETENTION_DAYS`, job de expurgo), exportação e exclusão de dados pessoais por contato.
- Anexos em storage S3-compatível, com URL assinada de curta duração; nunca URL pública.

## 8. Multi-tenant

Tudo pendurado em `organization_id` para permitir mais de uma loja. No MVP existe uma única organização, mas o modelo já carrega a coluna e os índices compostos — retrofit disso depois é caro.
