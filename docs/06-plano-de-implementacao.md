# Plano de implementação

Doze etapas até o MVP completo. Cada uma termina com algo verificável — não com “parte pronta”. Estimativas assumem uma pessoa em tempo integral; some folga se houver revisão.

## Status real (atualizado durante a implementação)

A ordem de execução divergiu do plano original — a loja é a RISE, não a Ateliê Marés fictícia, e a prioridade foi ter algo testável com o WhatsApp real o quanto antes. O que está de pé, verificado rodando (não só codificado):

- **Fundação**: monorepo, `docker-compose` com Postgres+pgvector, Redis, MinIO e WAHA. Seed com o conteúdo real do site da RISE na base de conhecimento.
- **Autenticação**: login com sessão em Redis (sobrevive a restart da API), RBAC por perfil.
- **WhatsApp real**: sessão WAHA pareada e conectada, webhook validando idempotência.
- **Inbox funcional**: três colunas, tempo real por SSE, mídia (foto e áudio) recebida e enviada, arquivada em storage próprio, transferência entre setores, notificação de mensagem nova.
- **Worker BullMQ**: todo o processamento de mensagem recebida saiu do processo da API e roda em `apps/worker`, com fila no Redis. Testado derrubando o worker no meio do fluxo — a mensagem fica na fila e é processada assim que ele volta, sem se perder.

Ainda não implementado: IA (Etapa 8), Kanban visual (Etapa 10), dashboard (Etapa 11), telas de administração, HMAC no webhook, rate limiting, testes automatizados.

## Etapa 0 — Fundação (2–3 dias)
Monorepo pnpm + Turborepo, TypeScript estrito, ESLint com regra de dependência entre camadas, Prettier. `docker-compose.yml` com Postgres 16 + pgvector, Redis 7, MinIO e WAHA. Prisma com o schema já modelado, migration inicial (`CREATE EXTENSION vector, pg_trgm`) e seed com dados fictícios brasileiros realistas: loja **Ateliê Marés**, 8 usuários, 3 filas, ~60 produtos com variações de tamanho e cor, 40 contatos, 120 pedidos, conversas em todos os estados.
**Pronto quando:** `docker compose up` sobe tudo e `pnpm db:seed` popula o banco.

## Etapa 1 — Autenticação e usuários (3–4 dias)
Login, sessão em cookie httpOnly, refresh rotativo, RBAC em middleware e nos casos de uso, CRUD de usuários e filas, tela de login e área administrativa de usuários, `audit_log` ligado.
**Pronto quando:** os três perfis entram e enxergam exatamente o que lhes cabe; atendente recebe 403 nas rotas de administração.

## Etapa 2 — Domínio de conversas (4–5 dias)
Entidades, `ConversationControl` (a política única de quem pode responder), geração de protocolo, transições, `conversation_event`. Testes unitários cobrindo toda a máquina de estados, incluindo os casos negativos (bot tentando responder em `ATENDIMENTO_HUMANO`).
**Pronto quando:** a suíte de estados passa e nenhuma transição inválida é possível pela API.

## Etapa 3 — Adapter WAHA (4–5 dias)
Client com retry, timeout e circuit breaker; envio de texto e mídia; marcar como lida; estado da sessão; webhook com validação HMAC e idempotência por `webhook_event`; `integration_log` com redação de segredos; modo `disabled` que falha explicitamente. Tela de configuração da WAHA com teste de conexão e eventos recentes.
**Pronto quando:** mensagem enviada do celular aparece no banco e uma resposta pela API chega ao WhatsApp; reentrega do mesmo evento não duplica nada.

## Etapa 4 — Inbox em tempo real (5–7 dias)
SSE com fan-out por Redis, lista virtualizada com todos os filtros, thread com mídia e status, compositor com anexo e áudio, painel do cliente, busca por nome/telefone/pedido/protocolo, skeletons e estados vazios, tema claro e escuro, responsivo nos três tamanhos.
**Pronto quando:** duas abas com usuários diferentes veem a mesma mensagem chegar sem recarregar.

## Etapa 5 — Bot de boas-vindas e triagem (3 dias)
Fluxo do menu, janela de inatividade, mapeamento das cinco opções, contexto de produto vindo dos botões da loja.
**Pronto quando:** o menu chega uma única vez por conversa e cada opção leva ao estado correto.

## Etapa 6 — Fila e transferência (4 dias)
Handoff com coleta de dados e resumo, roteamento por fila, notificação dos disponíveis, ações do atendente (assumir, transferir, devolver, aguardar, finalizar), SLA de primeira resposta.
**Pronto quando:** “Assumir” pausa bot e IA de imediato — comprovado por teste que enfileira um job de IA e o vê ser descartado no dispatch.

## Etapa 7 — Base de conhecimento (4–5 dias)
Upload de PDF, DOCX, texto e URL; extração, chunking com sobreposição, embeddings, índice HNSW no pgvector; tela de administração com status de indexação e painel de teste de busca.
**Pronto quando:** um PDF de política de trocas é indexado e a busca devolve o trecho certo com score.

## Etapa 8 — Assistente de IA (5–7 dias)
Prompt da vendedora virtual, tool calling, guardrails, cálculo de confiança, classificação de intenção e sentimento, sugestão e resumo para o atendente, registro de custo e latência, teto de orçamento.
**Pronto quando:** a IA responde tamanho e estoque só a partir de tool call, e uma pergunta fora da base gera a frase de segurança seguida de transferência.

## Etapa 9 — Nuvemshop (5–6 dias) — **FORA DO ESCOPO POR ORA**

Decisão de 15/08/2026: a integração com a Nuvemshop fica adiada. O modelo de dados (`product`, `product_variant`, `order`, `order_item`) permanece no schema, e as automações de `order.*` e `product.back_in_stock` nascem desligadas no seed. Sem essa integração, valem duas consequências que precisam estar claras:

- **Preço, estoque, tamanho e cor não têm fonte confiável.** O catálogo do seed traz nomes e preços reais do site, mas a grade e o estoque são dados de desenvolvimento. A IA está proibida de responder sobre isso pelo documento "Lacunas" da base.
- **Status de pedido também não.** Consulta de pedido vai para atendimento humano até a integração existir.

Escopo original, para quando for retomada:

Sincronização de produtos, variações, estoque, clientes e pedidos; webhooks de pedido pago, enviado e entregue; ficha comercial do contato (ticket médio, tamanhos e categorias mais comprados, cupons); validação do cliente antes de dados privados.
**Pronto quando:** um pedido pago na loja aparece no CRM em segundos, sem esperar a sincronização periódica.

## Etapa 10 — Kanban e oportunidades (3–4 dias)
Board com as nove etapas, arrastar acessível, automações por mudança de etapa, CRUD de oportunidades com valor, probabilidade e motivo de perda.
**Pronto quando:** mover um card dispara a automação configurada e registra o evento.

## Etapa 11 — Automações e dashboard (5–6 dias)
Construtor “Quando X · Se Y · Então Z”, motor de execução com retentativa e histórico, automações do seed; dashboard com todos os indicadores e desempenho por atendente.
**Pronto quando:** pedido enviado dispara mensagem de rastreamento e o dashboard reflete o atendimento correspondente.

## Etapa 12 — Segurança, LGPD e produção (4–5 dias)
Rate limiting, sanitização, retenção com expurgo agendado, exportação e exclusão de dados pessoais, registro de consentimento, revisão de auditoria, Dockerfiles multi-stage, health checks, teste de carga básico da inbox.
**Pronto quando:** a revisão de segurança passa e nenhum segredo de integração aparece no bundle do cliente (verificado por busca no build).

---

**Total estimado:** 51–66 dias úteis (≈11 a 14 semanas) para o MVP completo — **46–60 dias (≈10 a 12 semanas) sem a Etapa 9**, que está fora do escopo por ora.

**Caminho crítico mais curto** (fluxo ponta a ponta funcionando, sem IA nem Nuvemshop): etapas 0→6, cerca de 25 a 31 dias.

## Riscos

| Risco | Mitigação |
|---|---|
| Sessão da WAHA cair (WhatsApp não oficial) | Monitor de sessão, alerta ao administrador, reconexão automática, fila de saída que segura mensagens |
| Limite de requisições da Nuvemshop | Cache com `syncedAt`, webhooks como fonte primária, backoff |
| IA inventar preço ou prazo | Preço e estoque exclusivamente por tool call; guardrail bloqueia números não vindos de ferramenta |
| Custo de IA fora de controle | Teto mensal, classificação em modelo menor, cache de embeddings |
| Duplicação de mensagens em reentrega | Unique `(provider, externalId)` gravado antes de qualquer efeito |
