# Rotas da API

Base: `/api/v1`. Autenticação por cookie de sessão (`crm_session`, httpOnly). Todas as respostas em JSON; erros no formato `{ error: { code, message, details? } }`.

Convenções: listagens aceitam `?page`, `?limit` (máx. 100), `?sort`. Toda rota valida RBAC — a coluna **Perfil** indica o mínimo. `ATD` = atendente e acima, `SUP` = supervisor e acima, `ADM` = só administrador.

## Autenticação

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/auth/login` | público | E-mail + senha; rate limit 5/min por IP |
| POST | `/auth/logout` | ATD | Revoga a sessão |
| POST | `/auth/refresh` | ATD | Rotaciona o refresh token |
| GET | `/auth/me` | ATD | Usuário, perfil, filas e permissões |
| PATCH | `/auth/me/status` | ATD | `DISPONIVEL` / `AUSENTE` / `OCUPADO` |

## Usuários e filas

| Método | Rota | Perfil |
|---|---|---|
| GET / POST | `/users` | ADM |
| GET / PATCH / DELETE | `/users/:id` | ADM |
| GET | `/users/:id/performance` | SUP |
| GET / POST | `/queues` | SUP (leitura) / ADM (escrita) |
| PATCH / DELETE | `/queues/:id` | ADM |
| POST / DELETE | `/queues/:id/members/:userId` | SUP |

## Conversas (inbox)

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| GET | `/conversations` | ATD | Filtros: `state`, `queueId`, `assigneeId`, `tagId`, `unread`, `stage`, `q` (nome, telefone, nº do pedido, protocolo), `updatedSince` |
| GET | `/conversations/:id` | ATD | Conversa + contato + estado + responsável |
| GET | `/conversations/:id/messages` | ATD | Paginação por cursor (`before`) |
| POST | `/conversations/:id/messages` | ATD | Envia texto ou mídia (`multipart/form-data`). Rejeita 409 se o estado não permitir |
| POST | `/conversations/:id/read` | ATD | Marca como lida (local + WAHA) |
| POST | `/conversations/:id/assume` | ATD | Assume; **pausa bot e IA na mesma transação** |
| POST | `/conversations/:id/transfer` | ATD | Body: `{ toUserId? , toQueueId?, reason }` |
| POST | `/conversations/:id/return-to-bot` | ATD | Devolve para automação |
| POST | `/conversations/:id/wait-customer` | ATD | → `AGUARDANDO_CLIENTE` |
| POST | `/conversations/:id/close` | ATD | Body: `{ reason, requestRating? }` |
| POST | `/conversations/:id/reopen` | ATD | |
| PATCH | `/conversations/:id/stage` | ATD | Move no Kanban; dispara automações da etapa |
| GET / POST | `/conversations/:id/notes` | ATD | Observações internas |
| GET | `/conversations/:id/events` | SUP | Trilha de transições |

### IA sob demanda

| Método | Rota | Descrição |
|---|---|---|
| POST | `/conversations/:id/ai/suggest` | Devolve sugestão de resposta **sem enviar**, com trechos usados e confiança |
| POST | `/conversations/:id/ai/summary` | Resumo da conversa para o atendente |
| POST | `/conversations/:id/ai/handoff` | Força transferência para humano com motivo |

## Contatos e oportunidades

| Método | Rota | Perfil |
|---|---|---|
| GET / POST | `/contacts` | ATD |
| GET / PATCH | `/contacts/:id` | ATD |
| GET | `/contacts/:id/timeline` | ATD |
| GET | `/contacts/:id/commerce` | ATD — pedidos, ticket médio, tamanhos e categorias mais comprados, cupons, carrinhos |
| POST | `/contacts/:id/verify` | ATD — inicia validação do cliente antes de expor dados de pedido |
| GET / POST / DELETE | `/contacts/:id/tags` | ATD |
| GET / POST | `/contacts/:id/consents` | ATD |
| POST | `/contacts/:id/export` | ADM — LGPD, gera arquivo assinado |
| DELETE | `/contacts/:id/personal-data` | ADM — anonimização |
| GET / POST | `/opportunities` | ATD |
| GET / PATCH / DELETE | `/opportunities/:id` | ATD |

## Catálogo e pedidos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/products` | Busca por nome, SKU, categoria |
| GET | `/products/:id` | Produto + variações + estoque (revalida na Nuvemshop se obsoleto) |
| GET | `/orders` | Filtros por status, contato, período |
| GET | `/orders/:id` | Exige contato verificado quando acessado no contexto de uma conversa |
| POST | `/integrations/nuvemshop/sync` | ADM — sincronização manual (`{ scope: 'products'\|'orders'\|'customers'\|'all' }`) |

## Base de conhecimento

| Método | Rota | Perfil |
|---|---|---|
| GET / POST | `/knowledge/documents` | ADM (upload PDF/DOCX/texto/URL) |
| GET / PATCH / DELETE | `/knowledge/documents/:id` | ADM |
| POST | `/knowledge/documents/:id/reindex` | ADM |
| GET | `/knowledge/documents/:id/chunks` | ADM |
| POST | `/knowledge/search` | ADM — testa a busca semântica e mostra scores |

## Automações

| Método | Rota | Perfil |
|---|---|---|
| GET / POST | `/automations` | ADM |
| GET / PATCH / DELETE | `/automations/:id` | ADM |
| POST | `/automations/:id/test` | ADM — executa em modo seco |
| GET | `/automations/:id/runs` | SUP — histórico, falhas, retentativas |
| POST | `/automations/runs/:runId/retry` | ADM |

## Integrações e observabilidade

| Método | Rota | Descrição |
|---|---|---|
| GET | `/integrations` | Estado das três integrações. **Nunca** devolve segredo — só `secretHint` |
| PUT | `/integrations/:provider` | ADM — grava config e segredo (cifrado) |
| POST | `/integrations/:provider/test` | ADM — testa conexão de verdade e grava resultado |
| GET | `/integrations/waha/session` | Estado da sessão WAHA |
| POST | `/integrations/waha/session/restart` | ADM |
| GET | `/integrations/logs` | SUP — `?provider`, `?success`, `?since` |
| GET | `/integrations/webhook-events` | SUP — eventos recentes e data do último |

## Dashboard

| Método | Rota | Descrição |
|---|---|---|
| GET | `/analytics/overview` | Conversas recebidas, novos contatos, em espera, TMPR, TMR, taxa de transferência IA→humano, resolvidos pela automação |
| GET | `/analytics/commerce` | Conversões pelo WhatsApp, pedidos vinculados, faturamento influenciado |
| GET | `/analytics/agents` | Desempenho por atendente |
| GET | `/analytics/intents` | Principais dúvidas e intenções |
| GET | `/analytics/csat` | Avaliações |

## Tempo real

| Método | Rota | Descrição |
|---|---|---|
| GET | `/stream` | SSE. `?channels=org,conversation:{id}`. Autorização por sessão; atendente só recebe eventos das próprias filas |

## Webhooks (sem sessão, autenticados por assinatura)

| Método | Rota | Validação |
|---|---|---|
| POST | `/webhooks/waha` | HMAC SHA-256 em `X-Waha-Signature` (quando configurado) + `WAHA_WEBHOOK_TOKEN` |
| POST | `/webhooks/nuvemshop` | Header `Authentication` (HMAC do corpo com o client secret) |

Ambos: gravam em `webhook_event` com unique `(provider, externalId)`, respondem `200` imediatamente e enfileiram o processamento. Reentrega de um `externalId` já visto responde `200` sem reprocessar.

## Saúde

| Método | Rota |
|---|---|
| GET | `/health` — liveness |
| GET | `/health/ready` — Postgres, Redis, sessão WAHA |
