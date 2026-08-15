import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

declare global {
  // Evita múltiplas instâncias durante o hot reload em desenvolvimento.
  // eslint-disable-next-line no-var
  var __crmPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__crmPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__crmPrisma = prisma;
}
