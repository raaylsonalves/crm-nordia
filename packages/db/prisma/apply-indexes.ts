/**
 * Índices que o Prisma não sabe declarar (pgvector HNSW e busca textual por trigram).
 * Roda depois de cada migration — é idempotente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  // Busca semântica na base de conhecimento (distância de cosseno).
  `CREATE INDEX IF NOT EXISTS kb_chunk_embedding_idx
     ON knowledge_chunk USING hnsw (embedding vector_cosine_ops)`,

  // Busca por nome de contato e de produto tolerante a erro de digitação.
  `CREATE INDEX IF NOT EXISTS contact_name_trgm_idx
     ON contact USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS product_name_trgm_idx
     ON product USING gin (name gin_trgm_ops)`,

  // Inbox: conversas abertas ordenadas por atividade recente.
  // Colunas em camelCase porque o schema mapeia só os nomes de tabela.
  `CREATE INDEX IF NOT EXISTS conversation_open_idx
     ON conversation ("organizationId", "lastMessageAt" DESC)
     WHERE state <> 'FINALIZADO'`,
];

async function main() {
  for (const sql of statements) {
    const name = sql.match(/INDEX IF NOT EXISTS (\w+)/)?.[1] ?? "índice";
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✔ ${name}`);
    } catch (error) {
      console.error(`  ✖ ${name}:`, (error as Error).message);
      throw error;
    }
  }
  console.log("Índices aplicados.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
