import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { prisma } from "@crm/db";
import Fastify from "fastify";
import { env } from "./env.js";
import { setOrgIdForLogs, waha } from "./integrations/waha.js";
import { carregarSessao } from "./plugins/auth.js";
import { redis, redisSaudavel } from "./redis.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { devRoutes } from "./routes/dev.js";
import { streamRoutes } from "./routes/stream.js";
import { webhookRoutes } from "./routes/webhooks.js";

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
      : {}),
  },
  // O corpo cru é necessário para validar o HMAC do webhook: recalcular a
  // assinatura sobre o JSON re-serializado daria diferente.
  bodyLimit: 10 * 1024 * 1024,
});

// Origem explícita (nunca "*"): o cookie de sessão só viaja com origem
// declarada e credentials habilitado.
await app.register(cors, {
  origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
  credentials: true,
});

await app.register(cookie);

// Ações como "assumir" e "marcar como lida" não têm corpo. Sem isto o Fastify
// devolve 415 para POST vazio, o que forçaria o front a mandar "{}" inútil.
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, corpo, done) => {
  if (!corpo || (typeof corpo === "string" && corpo.trim() === "")) return done(null, {});
  try {
    done(null, JSON.parse(corpo as string));
  } catch {
    done(new Error("JSON inválido"), undefined);
  }
});

// Carrega a sessão em toda requisição; o bloqueio fica por conta de cada rota.
app.addHook("preHandler", carregarSessao);

app.addHook("preValidation", async (request) => {
  if (typeof request.body === "object" && request.body !== null) {
    (request as { rawBody?: string }).rawBody = JSON.stringify(request.body);
  }
});

app.get("/health", async () => ({ status: "ok", mode: env.INTEGRATION_MODE }));

app.get("/health/ready", async (_request, reply) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks["postgres"] = "ok";
  } catch (error) {
    checks["postgres"] = error instanceof Error ? error.message : "falha";
  }
  checks["redis"] = (await redisSaudavel()) ? "ok" : "indisponível";
  try {
    const s = await waha.getSessionStatus();
    checks["waha"] = s.connected ? `ok (${s.status})` : `desconectado (${s.status})`;
  } catch (error) {
    checks["waha"] = error instanceof Error ? error.message : "falha";
  }
  // Sem Redis ninguém faz login: conta como degradado, não como saudável.
  const ok = checks["postgres"] === "ok" && checks["redis"] === "ok";
  return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degradado", checks });
});

await app.register(webhookRoutes, { prefix: "/api/v1" });
await app.register(authRoutes, { prefix: "/api/v1" });
await app.register(conversationRoutes, { prefix: "/api/v1" });
await app.register(streamRoutes, { prefix: "/api/v1" });

if (env.NODE_ENV !== "production") {
  await app.register(devRoutes, { prefix: "/api/v1/dev" });
  app.log.warn("rotas /api/v1/dev ativas SEM autenticação (apenas fora de produção)");
}

const org = await prisma.organization.findFirst({ where: { slug: "rise" }, select: { id: true } });
if (org) setOrgIdForLogs(org.id);
else app.log.error("organização 'rise' não encontrada — rode pnpm db:seed");

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
app.log.info(`integrações em modo ${env.INTEGRATION_MODE.toUpperCase()}`);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    void app
      .close()
      .then(() => prisma.$disconnect())
      .then(() => redis.quit())
      .then(() => process.exit(0));
  });
}
