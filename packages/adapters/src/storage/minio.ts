import { Client } from "minio";

/**
 * Armazenamento de mídia em S3-compatível (MinIO em desenvolvimento).
 *
 * A mídia recebida é baixada da WAHA e guardada aqui na chegada. Servir por
 * proxy direto da WAHA não funciona: ela apaga o arquivo por TTL, e o
 * atendimento precisa ver a foto que o cliente mandou semanas depois.
 */
export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

export class MinioStorage {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketVerificado = false;

  constructor(config: StorageConfig) {
    const url = new URL(config.endpoint);
    this.bucket = config.bucket;
    this.client = new Client({
      endPoint: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      useSSL: url.protocol === "https:",
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      ...(config.region ? { region: config.region } : {}),
    });
  }

  private async garantirBucket(): Promise<void> {
    if (this.bucketVerificado) return;
    if (!(await this.client.bucketExists(this.bucket))) {
      await this.client.makeBucket(this.bucket);
    }
    this.bucketVerificado = true;
  }

  async guardar(chave: string, conteudo: Buffer, mimeType: string): Promise<string> {
    await this.garantirBucket();
    await this.client.putObject(this.bucket, chave, conteudo, conteudo.length, {
      "Content-Type": mimeType,
    });
    return chave;
  }

  async ler(chave: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, chave);
    const partes: Buffer[] = [];
    for await (const parte of stream) partes.push(parte as Buffer);
    return Buffer.concat(partes);
  }

  async saudavel(): Promise<boolean> {
    try {
      await this.client.bucketExists(this.bucket);
      return true;
    } catch {
      return false;
    }
  }
}
