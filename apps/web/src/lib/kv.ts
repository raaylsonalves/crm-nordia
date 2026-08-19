/**
 * Armazenamento chave-valor para sessão — dois backends, escolhidos pelo que
 * estiver configurado, sem mudar quem chama.
 *
 * Por quê dois: `ioredis` fala o protocolo Redis nativo (TCP), que é o que
 * `apps/api` e `apps/worker` já usam — mas exige `REDIS_URL` no formato
 * `rediss://usuario:senha@host:porta`, que nem toda oferta gerenciada expõe
 * fácil (o Upstash, por padrão, destaca a API REST). O cliente REST do
 * Upstash fala HTTPS puro, e é o formato recomendado por eles mesmos para
 * function serverless — sem pool de conexão TCP para gerenciar entre
 * invocações frias. Sessão é só GET/SET/EXPIRE/DEL, então os dois servem
 * igual; não precisamos do que só o protocolo nativo oferece (pub/sub,
 * comandos bloqueantes) nesta variante, que nem usa BullMQ.
 */
export interface KVStore {
  get(chave: string): Promise<string | null>;
  setComExpiracao(chave: string, valor: string, segundos: number): Promise<void>;
  expirar(chave: string, segundos: number): Promise<void>;
  del(chave: string): Promise<void>;
}

class UpstashKV implements KVStore {
  constructor(private readonly client: import("@upstash/redis").Redis) {}

  async get(chave: string): Promise<string | null> {
    const valor = await this.client.get<string>(chave);
    return valor ?? null;
  }
  async setComExpiracao(chave: string, valor: string, segundos: number): Promise<void> {
    await this.client.set(chave, valor, { ex: segundos });
  }
  async expirar(chave: string, segundos: number): Promise<void> {
    await this.client.expire(chave, segundos);
  }
  async del(chave: string): Promise<void> {
    await this.client.del(chave);
  }
}

class IoredisKV implements KVStore {
  constructor(private readonly client: import("ioredis").default) {}

  async get(chave: string): Promise<string | null> {
    return this.client.get(chave);
  }
  async setComExpiracao(chave: string, valor: string, segundos: number): Promise<void> {
    await this.client.set(chave, valor, "EX", segundos);
  }
  async expirar(chave: string, segundos: number): Promise<void> {
    await this.client.expire(chave, segundos);
  }
  async del(chave: string): Promise<void> {
    await this.client.del(chave);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __crmKV: KVStore | undefined;
}

async function criarStore(): Promise<KVStore> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (restUrl && restToken) {
    const { Redis } = await import("@upstash/redis");
    // Sem isto, o cliente tenta ser "inteligente": vê que o valor guardado
    // parece JSON e desserializa sozinho no GET, devolvendo um objeto em vez
    // da string crua. Guardamos sempre string (JSON.stringify feito por nós
    // mesmos em session.ts) — precisamos da string de volta, não da
    // reinterpretação automática.
    return new UpstashKV(new Redis({ url: restUrl, token: restToken, automaticDeserialization: false }));
  }

  const { default: IORedis } = await import("ioredis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IoredisKV(
    new IORedis(url, {
      maxRetriesPerRequest: 3,
      ...(url.startsWith("rediss://") ? { tls: {} } : {}),
    }),
  );
}

export async function kv(): Promise<KVStore> {
  if (!globalThis.__crmKV) {
    globalThis.__crmKV = await criarStore();
  }
  return globalThis.__crmKV;
}
