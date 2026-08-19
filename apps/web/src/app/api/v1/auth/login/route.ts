import { prisma } from "@crm/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_NAME, autenticar, criarSessao } from "@/lib/session";

// Trava de força bruta por processo. Igual à ressalva das sessões: em
// serverless cada invocação fria zera este mapa — proteção real de rate
// limit em produção precisa viver no Redis, não na memória da function.
// Suficiente para o teste; não é o desenho final.
const tentativas = new Map<string, { contador: number; ate: number }>();
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const corpo = z.object({ email: z.string().email(), senha: z.string().min(1) }).safeParse(await request.json());
  if (!corpo.success) {
    return NextResponse.json({ error: { code: "DADOS_INVALIDOS", message: "Informe e-mail e senha." } }, { status: 400 });
  }

  const chave = corpo.data.email.toLowerCase();
  const bloqueio = tentativas.get(chave);
  if (bloqueio && bloqueio.contador >= MAX_TENTATIVAS && bloqueio.ate > Date.now()) {
    const minutos = Math.ceil((bloqueio.ate - Date.now()) / 60_000);
    return NextResponse.json(
      { error: { code: "MUITAS_TENTATIVAS", message: `Muitas tentativas. Tente novamente em ${minutos} min.` } },
      { status: 429 },
    );
  }

  const usuario = await autenticar(corpo.data.email, corpo.data.senha);
  if (!usuario) {
    const atual = tentativas.get(chave) ?? { contador: 0, ate: 0 };
    atual.contador += 1;
    atual.ate = Date.now() + BLOQUEIO_MS;
    tentativas.set(chave, atual);
    return NextResponse.json(
      { error: { code: "CREDENCIAIS_INVALIDAS", message: "E-mail ou senha incorretos." } },
      { status: 401 },
    );
  }

  tentativas.delete(chave);
  const token = await criarSessao(usuario);
  await prisma.user.update({ where: { id: usuario.id }, data: { lastSeenAt: new Date() } });

  const loja = await cookies();
  loja.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return NextResponse.json({
    usuario: { id: usuario.id, nome: usuario.name, email: usuario.email, perfil: usuario.role },
  });
}
