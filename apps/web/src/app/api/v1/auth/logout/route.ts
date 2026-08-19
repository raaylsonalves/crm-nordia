import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, destruirSessao, usuarioAtual } from "@/lib/session";

export async function POST() {
  const u = await usuarioAtual();
  if (!u) {
    return NextResponse.json({ error: { code: "NAO_AUTENTICADO", message: "Faça login para continuar." } }, { status: 401 });
  }

  const loja = await cookies();
  const token = loja.get(COOKIE_NAME)?.value;
  if (token) await destruirSessao(token);
  loja.delete(COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
