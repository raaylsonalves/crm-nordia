-- Telefone passa a ser opcional: o WhatsApp pode entregar apenas o LID
-- (identificador interno, ex.: 31886072111283@lid) sem expor o número real.
-- Derivar um telefone do LID criaria um número inexistente.
ALTER TABLE "contact" ALTER COLUMN "phone" DROP NOT NULL;

-- Contador próprio de falhas de interpretação de intenção.
-- Antes isso reaproveitava a coluna `priority`, o que corrompia a ordenação da fila.
ALTER TABLE "conversation" ADD COLUMN "intentFailures" INTEGER NOT NULL DEFAULT 0;
