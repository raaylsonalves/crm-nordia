import { defineConfig } from "@trigger.dev/sdk/v3";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

/**
 * Substitua "project" pela Project Ref do seu projeto no Trigger.dev
 * (Dashboard → Project settings → "proj_..."). Sem isso, `trigger.dev dev`
 * e `trigger.dev deploy` não sabem em qual projeto rodar.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_rzaroojjmchghgggqyfe",
  runtime: "node",
  logLevel: "log",
  maxDuration: 120,
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      // Sem isto, o esbuild do Trigger.dev empacota as tasks sem o binário
      // do Query Engine do Prisma — "prisma generate" roda no build, mas o
      // arquivo .so.node nunca é copiado pro bundle final. Mesma causa raiz
      // do erro que a Vercel deu antes (ver apps/web/next.config.mjs), só
      // que aqui o bundler é outro.
      prismaExtension({ schema: "../../packages/db/prisma/schema.prisma" }),
    ],
  },
});
