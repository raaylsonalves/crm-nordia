# Fluxos de atendimento

## 1. Entrada de mensagem (webhook WAHA)

```
POST /webhooks/waha
 1. Valida token e HMAC (comparação em tempo constante) ──falha──▶ 401 + integration_log
 2. Ignora se fromMe = true (mensagem do próprio número)
 3. INSERT webhook_event (provider, externalId) ──conflito──▶ 200 "já processado" (fim)
 4. 200 imediato + enfileira inbound-message
──────────────────────── worker: inbound-message ────────────────────────
 5. Contato: busca por (organizationId, waChatId); se não existir, cria com
    nome do pushName e origem inferida do texto (SKU/campanha) ou "organico"
 6. Conversa: última conversa do contato
      • aberta                     → reutiliza
      • FINALIZADA ou última mensagem há mais de INACTIVITY_WINDOW_MINUTES
                                   → abre nova conversa + novo protocolo
 7. INSERT message (INBOUND, CLIENTE) + lastMessageAt + unreadCount++
 8. Publica message.created no canal da conversa (SSE)
 9. Marca como lida na WAHA se a conversa estiver aberta na tela de alguém
10. Roteia pelo estado:
      BOT                  → fluxo de menu (item 2)
      IA                   → pipeline de IA (item 3)
      AGUARDANDO_ATENDENTE → apenas notifica a fila; nenhum envio automático
      ATENDIMENTO_HUMANO   → apenas notifica o responsável
      AGUARDANDO_CLIENTE   → volta para ATENDIMENTO_HUMANO e notifica
      FINALIZADO           → tratado no passo 6 (nova conversa)
11. Dispara automações com gatilho message.received
```

**Contexto vindo da loja.** Se o texto contiver SKU, código de produto ou URL da Nuvemshop (padrões em `metadata.productHint`), consulta o catálogo antes do menu e responde:

> Olá! Vi que você está interessado no produto **{produto}**. Ele está disponível nas opções **{variações}**. Como posso ajudar?

Se o produto não for encontrado na Nuvemshop, segue o menu normal — nunca se inventa produto.

## 2. Boas-vindas e triagem (estado `BOT`)

Envia o menu apenas quando `welcomeSentAt` é nulo **nesta conversa**. Como uma conversa só nasce após `INACTIVITY_WINDOW_MINUTES` (padrão 360) de silêncio, o cliente não recebe boas-vindas a cada mensagem.

```
Olá, {nome}! 👋
Bem-vindo à {nome_da_loja}.
Para agilizar seu atendimento, escolha uma opção:
1️⃣ Quero comprar
2️⃣ Preciso de ajuda com tamanho
3️⃣ Acompanhar meu pedido
4️⃣ Troca ou devolução
5️⃣ Falar com um atendente
Digite o número da opção desejada.
```

| Opção | Ação | Estado resultante |
|---|---|---|
| 1 | Contexto de venda; cria oportunidade | `IA` · funil `OPORTUNIDADE_VENDA` |
| 2 | Contexto de tabela de medidas | `IA` |
| 3 | Pede identificação e valida o cliente antes de mostrar o pedido | `IA` |
| 4 | Contexto de política de trocas | `IA` |
| 5 | Transferência direta | `AGUARDANDO_ATENDENTE` |

Texto livre em vez de número: classifica a intenção pela IA e segue o mesmo mapa. Duas falhas seguidas de interpretação → transferência (motivo `falha_intencao`).

## 3. Resposta da IA (estado `IA`)

```
1. Revalida ConversationControl.canRespond('IA', conversa) — a conversa pode ter
   sido assumida enquanto o job estava na fila. Se não puder, descarta o job.
2. Classifica intenção, sentimento e prioridade → grava na conversa
3. Sentimento negativo forte ou palavras de reclamação → transfere (insatisfacao)
4. Recupera contexto: busca semântica na base + catálogo ao vivo + histórico do contato
5. Gera resposta com ferramentas:
     buscar_produto · consultar_estoque · consultar_pedido (exige verificação)
     consultar_politica · transferir_para_humano
6. Guardrails:
     • preço, estoque, prazo e variação só podem vir de tool call
     • nenhuma política sem trecho recuperado que a sustente
     • sem desconto sem regra comercial cadastrada
     • confiança < AI_CONFIDENCE_THRESHOLD (padrão 0,7) → transfere
7. Envia pela WAHA e grava ai_interaction (trechos, confiança, custo, latência)
```

Sem informação confiável, a resposta é sempre:

> Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar.

seguida da transferência.

## 4. Transferência para humano

**Gatilhos:** opção 5; pedido explícito por uma pessoa; confiança insuficiente; insatisfação; problema de pagamento, reclamação ou exceção comercial; pergunta fora da base; falha repetida de intenção.

```
1. Coleta (do histórico, perguntando só o que faltar):
     nome · motivo do contato · produto relacionado · nº do pedido · resumo
2. Gera resumo da conversa pela IA e grava em handoff
3. Estado → AGUARDANDO_ATENDENTE, queuedAt = agora, bot e IA pausados
4. Escolhe a fila pela intenção (Vendas, Trocas, Suporte); sem match → fila padrão
5. Envia ao cliente:
     "Perfeito! Já encaminhei sua solicitação para nossa equipe.
      Protocolo: #{protocolo}
      Enquanto aguarda, você pode enviar fotos, referências ou outras informações
      que possam ajudar no atendimento."
6. Notifica atendentes DISPONIVEL da fila abaixo do teto (SSE + push opcional)
7. Agenda alerta de SLA de primeira resposta
```

## 5. Ações do atendente

| Ação | Efeito |
|---|---|
| **Assumir** | `assigneeId` = usuário, estado → `ATENDIMENTO_HUMANO`, bot e IA pausados na mesma transação, `firstReplyAt` marcado no primeiro envio |
| **Transferir** | Para usuário (→ `ATENDIMENTO_HUMANO`) ou fila (→ `AGUARDANDO_ATENDENTE`); exige motivo; registra evento |
| **Solicitar ajuda da IA** | Sugestão ou resumo, exibidos apenas ao atendente |
| **Devolver para a automação** | Estado → `BOT`, responsável limpo; não reenvia boas-vindas |
| **Aguardar cliente** | Estado → `AGUARDANDO_CLIENTE`; agenda lembrete e fechamento automático |
| **Finalizar** | Estado → `FINALIZADO`, `closedAt`, motivo; dispara pesquisa de avaliação |

Toda ação passa por `ConfirmDialog` quando é irreversível (finalizar, transferir, devolver).

## 6. Validação do cliente antes de dados de pedido

Antes de expor valor, endereço ou status de pedido, o cliente confirma um dado que só ele saberia: e-mail do pedido **ou** CPF (últimos 3 dígitos) **ou** número do pedido + nome. Resultado gravado como `verifiedAt` na conversa, válido enquanto a conversa estiver aberta. Sem verificação, a IA responde só com informação genérica e oferece transferência.

## 7. Automações prontas (seed)

| Gatilho | Condição | Ação |
|---|---|---|
| `message.received` | primeira da conversa e estado `BOT` | enviar boas-vindas |
| `intent.human_requested` | — | colocar na fila e notificar |
| `order.paid` | contato com WhatsApp consentido | confirmar pagamento |
| `order.shipped` | tem código de rastreio | enviar rastreamento |
| `order.delivered` | — | iniciar pós-venda (D+2) |
| `product.back_in_stock` | há interessados na variação | avisar interessados |
| `conversation.idle` | sem resposta há mais de o SLA | alertar responsável e supervisor |
| `conversation.closed` | duração > 2 min | pedir avaliação (1 a 5) |
| `ai.low_confidence` | confiança < limiar | transferir para humano |

Cada execução grava `automation_run` com entrada, resultado, erro e tentativa; falhas têm retentativa exponencial e podem ser reprocessadas pela tela de administração.
