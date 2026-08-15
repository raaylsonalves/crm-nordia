# CRM Rise

CRM de atendimento da **RISE** ([userisefit.com.br](https://userisefit.com.br)) — moda fitness com propósito, Fortaleza/CE. Centraliza WhatsApp (WAHA) e assistente de IA em uma única interface.

**Status: Etapa 0 concluída.** Banco modelado, migrado e populado. Nenhuma integração está implementada — e nenhuma será simulada como se estivesse.

**Escopo atual:** WhatsApp (WAHA) + IA. A **integração com a Nuvemshop está fora do escopo por ora** — o modelo de dados de produtos e pedidos permanece pronto, e as automações que dependem de eventos da loja (`order.paid`, `order.shipped`, `order.delivered`, `product.back_in_stock`) nascem desligadas.

## Documentos

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/01-arquitetura.md) | Componentes, portas e adaptadores, tempo real, máquina de estados, pipeline de IA, segurança |
| [Modelagem](packages/db/prisma/schema.prisma) | Schema Prisma completo (PostgreSQL + pgvector) |
| [API](docs/02-api.md) | Rotas REST, SSE e webhooks, com perfil mínimo por rota |
| [Estrutura de pastas](docs/03-estrutura-de-pastas.md) | Monorepo e regras de dependência |
| [Wireframes](docs/04-wireframes.md) | Telas, componentes e direção visual |
| [Fluxos](docs/05-fluxos-de-atendimento.md) | Entrada de mensagem, triagem, IA, transferência, ações do atendente |
| [Plano](docs/06-plano-de-implementacao.md) | 12 etapas até o MVP, com critério de pronto e riscos |
| [.env.example](.env.example) | Todas as variáveis de ambiente |

## Decisões que valem destaque

- **Integrações nunca fingem funcionar.** `INTEGRATION_MODE=disabled` faz o adapter lançar `IntegrationDisabledError`, visível na UI como “integração não configurada”. Não existe modo que devolva resposta fabricada.
- **Um único ponto decide quem responde.** `ConversationControl.canRespond()` é consultado pelo bot e pela IA antes de enviar e revalidado no momento do dispatch — assumir um atendimento pausa a automação de imediato, inclusive para jobs já enfileirados.
- **Preço, estoque e prazo só vêm da Nuvemshop.** A IA os obtém por tool call; o guardrail bloqueia números gerados livremente pelo modelo.
- **Segredos só no back-end.** Cifrados com AES-256-GCM; a API devolve apenas os 4 últimos caracteres.
- **Idempotência antes de qualquer efeito.** `webhook_event` com unique `(provider, externalId)`.

## Base de conhecimento

O conteúdo vem do site público da RISE (Quem Somos, Política de Troca, Política de Entrega, Contato), extraído em 15/08/2026 — cada documento guarda a URL de origem.

O que o site **não** publica está reunido no documento **"Lacunas — o que a IA NÃO pode responder"**, marcado como `EXIGE_CONFIRMACAO`: formas de pagamento e parcelamento, tabela de medidas, valores e prazos de frete, quem paga o frete da troca, grade de tamanhos e cores, política de defeito, CNPJ e redes sociais. Sobre esses temas a IA usa a frase padrão e transfere. É essa lista que separa "a IA não sabe" de "a IA chutou".

Há ainda uma divergência real a corrigir no site: a página de troca informa `userisefiti@outlook.com` e a de contato, `userisefit@outlook.com`.

## Próximo passo

Etapa 1: autenticação, RBAC e gestão de usuários e filas.

```bash
pnpm setup
```
