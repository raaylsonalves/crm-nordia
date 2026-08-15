import { MinioStorage } from "@crm/adapters";
import { env } from "../env.js";

export const storage = new MinioStorage({
  endpoint: env.STORAGE_ENDPOINT,
  bucket: env.STORAGE_BUCKET,
  accessKey: env.STORAGE_ACCESS_KEY,
  secretKey: env.STORAGE_SECRET_KEY,
  ...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {}),
});

/** Chave do objeto: separa por conversa e mantém a extensão para depuração. */
export function chaveDeMidia(conversationId: string, externalId: string, mimeType: string): string {
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  const seguro = externalId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `conversas/${conversationId}/${seguro}.${ext}`;
}
