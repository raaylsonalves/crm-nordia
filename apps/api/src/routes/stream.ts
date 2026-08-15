import type { FastifyInstance } from "fastify";
import { desinscrever, inscrever, totalInscritos } from "../realtime/bus.js";
import { exigirPerfil } from "../plugins/auth.js";

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stream", { preHandler: exigirPerfil() }, async (request, reply) => {
    const usuario = request.usuario!;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desliga o buffer do nginx: sem isso o evento fica preso no proxy.
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: conectado\ndata: {"usuario":"${usuario.name}"}\n\n`);

    const id = inscrever(usuario.id, reply);
    app.log.info({ usuario: usuario.email, conectados: totalInscritos() }, "SSE conectado");

    // Comentário periódico mantém a conexão viva através de proxies que
    // derrubam socket ocioso.
    const ping = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        clearInterval(ping);
      }
    }, 25_000);

    request.raw.on("close", () => {
      clearInterval(ping);
      desinscrever(id);
      app.log.info({ usuario: usuario.email, conectados: totalInscritos() }, "SSE desconectado");
    });

    // Mantém a requisição aberta: o Fastify não deve encerrar a resposta.
    return reply;
  });
}
