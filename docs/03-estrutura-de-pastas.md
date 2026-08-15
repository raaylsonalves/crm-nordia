# Estrutura de pastas

Monorepo pnpm + Turborepo.

```
crm-rise/
├─ apps/
│  ├─ web/                          # Next.js 15 (App Router)
│  │  ├─ src/app/
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (app)/
│  │  │  │  ├─ layout.tsx           # shell: menu lateral compacto + topo
│  │  │  │  ├─ inbox/
│  │  │  │  │  ├─ page.tsx          # 3 colunas
│  │  │  │  │  └─ [conversationId]/page.tsx
│  │  │  │  ├─ funil/page.tsx       # Kanban
│  │  │  │  ├─ contatos/[id]/page.tsx
│  │  │  │  ├─ oportunidades/page.tsx
│  │  │  │  ├─ produtos/page.tsx
│  │  │  │  ├─ pedidos/page.tsx
│  │  │  │  ├─ dashboard/page.tsx
│  │  │  │  └─ admin/
│  │  │  │     ├─ usuarios/  filas/  integracoes/
│  │  │  │     ├─ conhecimento/  automacoes/  auditoria/
│  │  │  └─ api/                    # apenas BFF: proxy de sessão, upload
│  │  ├─ src/components/
│  │  │  ├─ inbox/                  # ConversationList, MessageThread, Composer,
│  │  │  │                          # ControlBadge, CustomerPanel, FilterBar
│  │  │  ├─ funnel/                 # KanbanBoard, StageColumn, ConversationCard
│  │  │  ├─ knowledge/  automations/  analytics/
│  │  │  └─ common/                 # EmptyState, Skeleton, ConfirmDialog, StatusDot
│  │  ├─ src/hooks/                 # useEventStream, useConversations, useTheme
│  │  ├─ src/lib/                   # api client, formatters (BRL, telefone), rbac
│  │  └─ src/styles/
│  │
│  ├─ api/                          # Fastify
│  │  ├─ src/
│  │  │  ├─ server.ts  app.ts  env.ts
│  │  │  ├─ plugins/                # auth, rbac, rateLimit, errorHandler, requestId
│  │  │  ├─ routes/
│  │  │  │  ├─ auth/  users/  queues/  conversations/  messages/
│  │  │  │  ├─ contacts/  opportunities/  products/  orders/
│  │  │  │  ├─ knowledge/  automations/  integrations/  analytics/
│  │  │  │  ├─ stream/               # SSE
│  │  │  │  └─ webhooks/             # waha.ts, nuvemshop.ts
│  │  │  └─ schemas/                # Zod por rota
│  │
│  └─ worker/                       # BullMQ
│     └─ src/
│        ├─ index.ts
│        ├─ queues.ts               # definição das filas e opções de retry
│        ├─ processors/
│        │  ├─ inbound-message.ts   # pipeline do fluxo de entrada
│        │  ├─ outbound-message.ts  # envio pela WAHA + status
│        │  ├─ ai-reply.ts  ai-classify.ts
│        │  ├─ kb-index.ts          # extração, chunking, embeddings
│        │  ├─ nuvemshop-sync.ts  nuvemshop-webhook.ts
│        │  ├─ automation-run.ts
│        │  └─ retention-purge.ts
│        └─ schedulers/             # sync periódico, SLA, follow-up, expurgo
│
├─ packages/
│  ├─ core/                         # domínio puro, sem I/O
│  │  └─ src/
│  │     ├─ domain/                 # Conversation, Contact, Protocol, Funnel
│  │     ├─ usecases/               # ReceiveInboundMessage, AssumeConversation,
│  │     │                          # TransferToHuman, AnswerWithAi, RunAutomation
│  │     ├─ ports/                  # WhatsappPort, EcommercePort, AiPort,
│  │     │                          # VectorStorePort, StoragePort, EventBusPort
│  │     └─ policies/               # ConversationControl, AiGuardrails, Rbac
│  │
│  ├─ adapters/
│  │  └─ src/
│  │     ├─ waha/                   # client, hmac, mapper, errors
│  │     ├─ nuvemshop/              # client, mapper, webhook verify
│  │     ├─ ai/                     # provider, embeddings, tools, prompts/
│  │     ├─ storage/                # S3-compatible
│  │     └─ shared/                 # http com retry, circuit breaker, logging
│  │
│  ├─ db/                           # prisma/schema.prisma, migrations, seed.ts
│  ├─ ui/                           # design system (Radix + Tailwind + tokens)
│  └─ config/                       # eslint, tsconfig, tailwind preset compartilhados
│
├─ docs/                            # estes documentos
├─ docker/                          # Dockerfile.web, Dockerfile.api, Dockerfile.worker
├─ docker-compose.yml               # postgres+pgvector, redis, minio, waha, api, worker, web
├─ .env.example
├─ turbo.json
└─ pnpm-workspace.yaml
```

## Regras de dependência

```
web  →  (HTTP)  →  api  →  core  →  ports
                    ↓                 ↑
                 adapters ────────────┘   (implementam as portas)
                    ↓
                   db
```

- `core` não importa `adapters`, `db`, Prisma nem Fastify. Isso é verificado no lint (`import/no-restricted-paths`).
- `web` nunca importa `adapters` nem `db`. Nenhum token de integração existe no bundle do cliente.
