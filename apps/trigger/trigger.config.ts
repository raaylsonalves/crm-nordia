import { defineConfig } from "@trigger.dev/sdk/v3";

/**
 * Substitua "project" pela Project Ref do seu projeto no Trigger.dev
 * (Dashboard → Project settings → "proj_..."). Sem isso, `trigger.dev dev`
 * e `trigger.dev deploy` não sabem em qual projeto rodar.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_preencher_aqui",
  runtime: "node",
  logLevel: "log",
  maxDuration: 120,
  dirs: ["./src/trigger"],
});
