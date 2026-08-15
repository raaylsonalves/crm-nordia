import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type UserRole } from "@crm/db";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";

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
 * Sessões em memória do processo.
 *
 * Suficiente para uma instância; ao subir a segunda (ou ao reiniciar a API),
 * todo mundo é deslogado. Mover para Redis quando houver mais de um processo
 * — a troca é local a este arquivo.
 */
const sessoes = new Map<string, { user: SessionUser; expiraEm: number }>();

export function criarSessao(user: SessionUser): string {
  const token = randomBytes(32).toString("base64url");
  sessoes.set(token, { user, expiraEm: Date.now() + SESSION_TTL_MS });
  return token;
}

export function destruirSessao(token: string): void {
  sessoes.delete(token);
}

function lerSessao(token: string): SessionUser | null {
  const s = sessoes.get(token);
  if (!s) return null;
  if (s.expiraEm < Date.now()) {
    sessoes.delete(token);
    return null;
  }
  return s.user;
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
  const usuario = lerSessao(token);
  if (usuario) request.usuario = usuario;
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
