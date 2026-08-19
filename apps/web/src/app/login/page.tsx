"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post("/auth/login", { email, senha });
      router.push("/inbox");
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight" style={{ letterSpacing: "0.15em" }}>
            NORDIA
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
            Central de atendimento
          </p>
        </div>

        <form
          onSubmit={entrar}
          className="rounded-2xl border p-6 shadow-sm"
          style={{ background: "var(--superficie)", borderColor: "var(--borda)" }}
        >
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2"
            style={{ background: "var(--fundo)", borderColor: "var(--borda)", color: "var(--texto)" }}
          />

          <label htmlFor="senha" className="mb-1.5 block text-sm font-medium">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mb-5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2"
            style={{ background: "var(--fundo)", borderColor: "var(--borda)", color: "var(--texto)" }}
          />

          {erro && (
            <p
              role="alert"
              className="mb-4 rounded-lg px-3 py-2 text-sm"
              style={{ background: "#fdecea", color: "#a13b2e" }}
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: "var(--acento)" }}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
