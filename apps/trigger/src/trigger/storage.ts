import { MinioStorage } from "@crm/adapters";

export const storage = new MinioStorage({
  endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9000",
  bucket: process.env.STORAGE_BUCKET ?? "crm-rise-media",
  accessKey: process.env.STORAGE_ACCESS_KEY ?? "",
  secretKey: process.env.STORAGE_SECRET_KEY ?? "",
  region: process.env.STORAGE_REGION ?? "us-east-1",
});

export function chaveDeMidia(conversationId: string, externalId: string, mimeType: string): string {
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  const seguro = externalId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `conversas/${conversationId}/${seguro}.${ext}`;
}
