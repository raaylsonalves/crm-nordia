import { prisma } from "@crm/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { COOKIE_NAME, autenticar, criarSessao, destruirSessao, exigirPerfil } from "../plugins/auth.js";

/** Tentativas de login por e-mail, para travar força bruta. */
const tentativas = new Map<string, { contador: number; ate: number }>();
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const corpo = z
      .object({ email: z.string().email(), senha: z.string().min(1) })
      .safeParse(request.body);

    if (!corpo.success) {
      return reply.code(400).send({ error: { code: "DADOS_INVALIDOS", message: "Informe e-mail e senha." } });
    }

    const chave = corpo.data.email.toLowerCase();
    const bloqueio = tentativas.get(chave);
    if (bloqueio && bloqueio.contador >= MAX_TENTATIVAS && bloqueio.ate > Date.now()) {
      const minutos = Math.ceil((bloqueio.ate - Date.now()) / 60_000);
      return reply.code(429).send({
        error: { code: "MUITAS_TENTATIVAS", message: `Muitas tentativas. Tente novamente em ${minutos} min.` },
      });
    }

    const usuario = await autenticar(corpo.data.email, corpo.data.senha);

    if (!usuario) {
      const atual = tentativas.get(chave) ?? { contador: 0, ate: 0 };
      atual.contador += 1;
      atual.ate = Date.now() + BLOQUEIO_MS;
      tentativas.set(chave, atual);
      // Mensagem genérica: não revela se o e-mail existe.
      return reply.code(401).send({ error: { code: "CREDENCIAIS_INVALIDAS", message: "E-mail ou senha incorretos." } });
    }

    tentativas.delete(chave);
    const token = criarSessao(usuario);

    await prisma.user.update({ where: { id: usuario.id }, data: { lastSeenAt: new Date() } });
    await prisma.auditLog.create({
      data: {
        organizationId: usuario.organizationId,
        userId: usuario.id,
        action: "auth.login",
        entityType: "user",
        entityId: usuario.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.slice(0, 255) ?? null,
      },
    });

    return reply
      .setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/",
        maxAge: 12 * 60 * 60,
      })
      .send({ usuario: { id: usuario.id, nome: usuario.name, email: usuario.email, perfil: usuario.role } });
  });

  app.post("/auth/logout", { preHandler: exigirPerfil() }, async (request, reply) => {
    const cookie = request.headers.cookie ?? "";
    const token = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);
    if (token) destruirSessao(token);
    return reply.clearCookie(COOKIE_NAME, { path: "/" }).send({ ok: true });
  });

  app.get("/auth/me", { preHandler: exigirPerfil() }, async (request) => {
    const u = request.usuario!;
    const filas = await prisma.queueMember.findMany({
      where: { userId: u.id },
      include: { queue: { select: { id: true, name: true, color: true } } },
    });
    return {
      id: u.id,
      nome: u.name,
      email: u.email,
      perfil: u.role,
      filas: filas.map((f) => f.queue),
    };
  });

  app.patch("/auth/me/status", { preHandler: exigirPerfil() }, async (request, reply) => {
    const corpo = z
      .object({ status: z.enum(["DISPONIVEL", "AUSENTE", "OCUPADO", "OFFLINE"]) })
      .safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({ error: { code: "DADOS_INVALIDOS", message: "Status inválido." } });
    }
    await prisma.user.update({ where: { id: request.usuario!.id }, data: { status: corpo.data.status } });
    return reply.send({ ok: true, status: corpo.data.status });
  });
}
