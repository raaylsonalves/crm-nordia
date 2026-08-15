import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type UserRole } from "@crm/db";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { redis } from "../redis.js";

export const COOKIE_NAME = "crm_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

/**
 * Sessões no Redis: sobrevivem ao restart da API e são compartilhadas entre
 * instâncias. O TTL da chave faz a expiração — não há varredura a fazer.
 */
const CHAVE = (token: string) => `sessao:${token}`;

export async function criarSessao(user: SessionUser): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(CHAVE(token), JSON.stringify(user), "PX", SESSION_TTL_MS);
  return token;
}

export async function destruirSessao(token: string): Promise<void> {
  await redis.del(CHAVE(token));
}

async function lerSessao(token: string): Promise<SessionUser | null> {
  const bruto = await redis.get(CHAVE(token));
  if (!bruto) return null;
  // Renova o prazo a cada uso: quem está trabalhando não é deslogado no meio
  // de um atendimento por causa do relógio.
  await redis.pexpire(CHAVE(token), SESSION_TTL_MS);
  return JSON.parse(bruto) as SessionUser;
}

declare module "fastify" {
  interface FastifyRequest {
    usuario?: SessionUser;
  }
}

/** Popula request.usuario quando houver sessão válida. Não bloqueia. */
export async function carregarSessao(request: FastifyRequest): Promise<void> {
  const cookie = request.headers.cookie;
  if (!cookie) return;
  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return;
  const token = match.slice(COOKIE_NAME.length + 1);
  try {
    const usuario = await lerSessao(token);
    if (usuario) request.usuario = usuario;
  } catch (error) {
    // Redis fora do ar não deve virar 500 silencioso: a requisição segue sem
    // sessão e a rota devolve 401, que é o comportamento correto.
    request.log.error({ err: error }, "falha ao ler sessão no Redis");
  }
}

/**
 * Exige sessão e, opcionalmente, perfil mínimo.
 * A hierarquia é ATENDENTE < SUPERVISOR < ADMINISTRADOR.
 */
const NIVEL: Record<UserRole, number> = {
  ATENDENTE: 1,
  SUPERVISOR: 2,
  ADMINISTRADOR: 3,
};

export function exigirPerfil(minimo: UserRole = "ATENDENTE") {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.usuario) {
      await reply.code(401).send({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } });
      return;
    }
    if (NIVEL[request.usuario.role] < NIVEL[minimo]) {
      await reply.code(403).send({
        error: { code: "SEM_PERMISSAO", message: `Esta ação exige perfil ${minimo} ou superior.` },
      });
      return;
    }
  };
}

/**
 * Verifica a senha. Compara sempre contra um hash — mesmo com e-mail
 * inexistente — para não revelar quais e-mails existem pelo tempo de resposta.
 */
const HASH_FALSO = bcrypt.hashSync("senha-inexistente-para-igualar-o-tempo", 10);

export async function autenticar(email: string, senha: string): Promise<SessionUser | null> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), active: true },
  });

  const hash = user?.passwordHash ?? HASH_FALSO;
  const confere = await bcrypt.compare(senha, hash);

  if (!user || !confere) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

/** Comparação de tokens em tempo constante, para rotas que usem token fixo. */
export function compararToken(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
