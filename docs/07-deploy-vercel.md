# Deploy de teste na Vercel

Duas formas de rodar o mesmo `apps/web`, escolhidas automaticamente por uma variável de ambiente:

| | **Completa** (recomendada no dia a dia) | **Vercel** (teste, esta página) |
|---|---|---|
| Front | `apps/web` | `apps/web` |
| API | `apps/api` (Fastify), processo separado | Rotas do próprio Next.js, em `apps/web/src/app/api/v1/**` |
| Processamento de mensagem | `apps/worker` (BullMQ) | Tasks do Trigger.dev, em `apps/trigger/src/trigger/**` |
| Tempo real | SSE de verdade | Polling a cada 4s |
| Como escolher | `NEXT_PUBLIC_API_URL` definido | `NEXT_PUBLIC_API_URL` **ausente** |

A troca é automática: `apps/web/src/lib/api.ts` cai em `/api/v1` (mesma origem) quando `NEXT_PUBLIC_API_URL` não está definido, e é aí que as rotas Next.js entram em cena.

## O que esta variante cobre — e o que não cobre

**Cobre**, testado rodando de verdade (não só compilado): login, listar a inbox, abrir uma conversa, ver histórico, enviar mensagem de texto, assumir atendimento, receber mensagem do WhatsApp via Trigger.dev.

**Não cobre nesta primeira leva** — os botões existem na tela mas chamam rotas que não foram construídas para esta variante: enviar mídia, transferir, aguardar cliente, devolver para automação, finalizar, notas, listar filas. Usar esses botões aqui devolve 404. Para testar essas ações, use a variante completa (`apps/api` + `apps/web` com `NEXT_PUBLIC_API_URL` apontando pra ela).

## Passo a passo

### 1. Provisionar os serviços (todos têm integração de um clique com a Vercel)

- **Postgres** → Vercel Postgres (Neon) ou Neon direto. Copie a `DATABASE_URL`.
- **Redis** → Vercel KV (Upstash) ou Upstash direto. Copie a `REDIS_URL` — precisa ser a URL com protocolo `rediss://` (TLS), não a REST.
- **Storage** → Cloudflare R2 (compatível com S3, o adapter do MinIO funciona sem alteração). Anote endpoint, bucket, access key e secret key.
- **Trigger.dev** → você já tem conta. No dashboard do seu projeto, pegue:
  - **Project Ref** (`proj_...`) → vai em `apps/trigger/trigger.config.ts` (linha `project:`) ou na env `TRIGGER_PROJECT_REF`.
  - **Secret Key** (`tr_secret_...` ou similar, em Project Settings → API Keys) → vai na env `TRIGGER_SECRET_KEY`, tanto no projeto da Vercel quanto para rodar `trigger.dev dev`/`deploy` localmente.

### 2. Rodar as migrations contra o Postgres novo

```bash
cd packages/db
DATABASE_URL="<url do Neon/Vercel Postgres>" npx prisma migrate deploy
DATABASE_URL="<mesma url>" npx tsx prisma/apply-indexes.ts
DATABASE_URL="<mesma url>" npx tsx prisma/seed.ts          # RISE
DATABASE_URL="<mesma url>" npx tsx prisma/seed-nordia.ts   # NORDIA
```

### 3. Publicar as tasks no Trigger.dev

```bash
cd apps/trigger
npx trigger.dev@latest login     # abre o navegador, autentica com sua conta
npx trigger.dev@latest deploy    # publica process-inbound-message e process-ack-update
```

### 4. Deploy do `apps/web` na Vercel

No dashboard da Vercel, criar o projeto apontando para este repositório com **Root Directory = `apps/web`**, e configurar as variáveis de ambiente:

```
DATABASE_URL=<Neon/Vercel Postgres>
REDIS_URL=<Upstash, protocolo rediss://>
STORAGE_ENDPOINT=<endpoint do R2>
STORAGE_BUCKET=<bucket do R2>
STORAGE_ACCESS_KEY=<access key do R2>
STORAGE_SECRET_KEY=<secret key do R2>
STORAGE_REGION=auto
TRIGGER_SECRET_KEY=<do Trigger.dev>
TRIGGER_PROJECT_REF=<do Trigger.dev>
WAHA_BASE_URL=<onde a WAHA está acessível>
WAHA_API_KEY=<a mesma chave usada localmente>
WAHA_SESSION=rise-principal
INTEGRATION_MODE=live
WAHA_WEBHOOK_HMAC_SECRET=<gere um novo — obrigatório em produção>
```

**Não defina `NEXT_PUBLIC_API_URL`** — é a ausência dela que ativa esta variante.

### 5. Apontar a WAHA para o webhook público

A WAHA continua rodando onde já está (local, na sua máquina, ou em outro host — ver a ressalva abaixo). Só muda o destino do webhook:

```
WHATSAPP_HOOK_URL=https://<seu-projeto>.vercel.app/api/v1/webhooks/waha
```

Isso funciona porque é a WAHA quem chama o nosso webhook, nunca o contrário — se a WAHA está atrás de NAT/rede local, ainda assim ela alcança a internet para fazer essa chamada de saída sem precisar de nenhum túnel.

## O que continua fora da Vercel, e por quê

**WAHA não roda na Vercel em nenhuma hipótese** — é um container com Chromium headless que precisa ficar de pé o tempo todo com a sessão do WhatsApp salva em disco; Vercel não hospeda processo persistente nem disco persistente. Para um teste, deixe-a rodando local (como está) só repontando o webhook. Para algo além de teste, ela precisa de um host próprio (Railway, Render, Fly.io, VPS) com domínio e IP estáveis.

**Consequência prática:** se a sua máquina ou o Docker estiver desligado, a WAHA para de entregar mensagem — a variante Vercel do resto do sistema continua no ar, mas sem WhatsApp chegando.

## Duplicação consciente (dívida técnica registrada, não acidental)

`apps/web/src/lib/session.ts`, `org.ts` e `waha.ts` reimplementam pedaços que já existem em `apps/api` e `apps/worker`, adaptados para o runtime de rota do Next.js (cookies via `next/headers`, sem os tipos do Fastify). Da mesma forma, `apps/trigger/src/trigger/inbound-message.ts` reimplementa `apps/worker/src/processors/inbound-message.ts`, adaptado para a assinatura de task e logger do Trigger.dev (ordem dos argumentos do log é invertida entre pino e o SDK do Trigger.dev).

Juntar isso num pacote compartilhado é o próximo passo natural quando a variante Vercel deixar de ser só um teste — não foi feito agora para não arriscar mexer no que já está validado em `apps/api`/`apps/worker`.
