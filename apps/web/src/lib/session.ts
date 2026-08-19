/**
 * Autenticação e sessão para as rotas de API do Next.js.
 *
 * Deliberadamente paralelo a apps/api/src/plugins/auth.ts, não importado
 * dali: aquele arquivo mistura lógica pura com tipos do Fastify
 * (FastifyRequest/FastifyReply), e extrair só a parte pura teria exigido
 * mexer no serviço que já está validado em produção local. Duplicação
 * pequena e consciente — ver docs/07-deploy-vercel.md sobre consolidar
 * isso num pacote compartilhado quando a variante Vercel amadurecer.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type UserRole } from "@crm/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redis } from "./redis.js";

export const COOKIE_NAME = "crm_session";
const SESSION_TTL_S = 12 * 60 * 60; // 12h

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

const CHAVE = (token: string) => `sessao:${token}`;

export async function criarSessao(user: SessionUser): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(CHAVE(token), JSON.stringify(user), "EX", SESSION_TTL_S);
  return token;
}

export async function destruirSessao(token: string): Promise<void> {
  await redis.del(CHAVE(token));
}

async function lerSessao(token: string): Promise<SessionUser | null> {
  const bruto = await redis.get(CHAVE(token));
  if (!bruto) return null;
  await redis.expire(CHAVE(token), SESSION_TTL_S);
  return JSON.parse(bruto) as SessionUser;
}

/** Lê o usuário da sessão a partir do cookie da requisição atual. */
export async function usuarioAtual(): Promise<SessionUser | null> {
  const loja = await cookies();
  const token = loja.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await lerSessao(token);
  } catch {
    // Redis fora do ar: trata como não autenticado, não como erro 500.
    return null;
  }
}

const HASH_FALSO = bcrypt.hashSync("senha-inexistente-para-igualar-o-tempo", 10);

/** Mesma disciplina do lado Fastify: compara contra hash mesmo sem usuário. */
export async function autenticar(email: string, senha: string): Promise<SessionUser | null> {
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), active: true } });
  const hash = user?.passwordHash ?? HASH_FALSO;
  const confere = await bcrypt.compare(senha, hash);
  if (!user || !confere) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
}

export function compararToken(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
