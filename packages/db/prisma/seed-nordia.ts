/**
 * Seed da NORDIA Tech — segunda organização, isolada da RISE.
 *
 * Roda como comando separado (`pnpm db:seed:nordia`) e nunca é chamado pelo
 * seed principal: rodar um não apaga nem mexe nos dados do outro. As duas
 * organizações compartilham o mesmo banco, mas toda consulta da aplicação é
 * filtrada por organizationId — é esse filtro, já presente desde o schema
 * inicial, que impede uma conversa da NORDIA aparecer para quem atende a RISE
 * (e vice-versa).
 *
 * Fluxo do bot: "greet_and_collect", diferente do menu numérico da RISE.
 * Uma prestadora de serviço não vende peça por peça — a primeira mensagem já
 * pede o contexto do que a pessoa procura, e a resposta dela vai direto para
 * a fila humana. Ver settings.flowType e apps/worker/src/processors/inbound-message.ts.
 */
import bcrypt from "bcryptjs";
import { IntegrationMode, IntegrationProvider, PrismaClient, UserRole, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "nordia-tech";
const DOMINIO = "nordiatech.com.br";

const REPRESENTANTES = [
  { name: "Raylson Alves", email: `raylson.alves@${DOMINIO}` },
  { name: "Mayon Everson", email: `mayon.everson@${DOMINIO}` },
  { name: "Iury Castro", email: `iury.castro@${DOMINIO}` },
  { name: "Lucas Macedo", email: `lucas.macedo@${DOMINIO}` },
];

async function main() {
  const existente = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (existente) {
    console.log(`Organização '${SLUG}' já existe (id ${existente.id}). Nada a fazer — rode o reset manual se quiser recriar.`);
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: "NORDIA Tech",
      slug: SLUG,
      timezone: "America/Fortaleza",
      settings: {
        // Usado pelo worker para montar a saudação — mesmo campo que a RISE
        // usa para o nome da loja; aqui é o nome da empresa.
        storeName: "NORDIA Tech",
        companyName: "NORDIA Tech",
        flowType: "greet_and_collect",
        inactivityWindowMinutes: 360,
      },
    },
  });

  const senha = await bcrypt.hash("crm@2026", 10);
  const usuarios = [];
  for (const r of REPRESENTANTES) {
    usuarios.push(
      await prisma.user.create({
        data: {
          organizationId: org.id,
          name: r.name,
          email: r.email,
          passwordHash: senha,
          role: UserRole.ATENDENTE,
          status: UserStatus.DISPONIVEL,
          maxConcurrent: 6,
          lastSeenAt: new Date(),
        },
      }),
    );
  }

  const fila = await prisma.queue.create({
    data: {
      organizationId: org.id,
      name: "Atendimento",
      description: "Fila única — qualquer um dos representantes pode assumir.",
      color: "#2E5C8A",
      isDefault: true,
      slaFirstReplyM: 10,
      slaResolutionM: 120,
      businessHours: {
        seg_sex: { inicio: "08:00", fim: "18:00" },
        sab: null,
        dom: null,
      },
    },
  });

  for (const usuario of usuarios) {
    await prisma.queueMember.create({ data: { queueId: fila.id, userId: usuario.id } });
  }

  // Mesma disciplina da RISE: integrações nascem DISABLED, sem credencial
  // nenhuma. Para receber mensagens de verdade, a NORDIA precisa do próprio
  // número conectado a uma sessão própria na WAHA (ex.: "nordia-principal")
  // — não dá para compartilhar a sessão da RISE, cada número é uma
  // identidade de WhatsApp Business diferente.
  for (const provider of [IntegrationProvider.WAHA, IntegrationProvider.AI]) {
    await prisma.integration.create({
      data: {
        organizationId: org.id,
        provider,
        mode: IntegrationMode.DISABLED,
        config:
          provider === IntegrationProvider.WAHA
            ? { baseUrl: "http://localhost:3001", session: "nordia-principal" }
            : { model: "claude-sonnet-5" },
        status: "desconectado",
        statusMessage: "Integração não configurada. Informe as credenciais em Admin → Integrações.",
      },
    });
  }

  console.log(`
Seed concluído — NORDIA Tech
  organização ......... ${org.name} (${org.slug})
  representantes ....... ${usuarios.map((u) => u.name).join(", ")}
  fila ................. ${fila.name}
  integrações .......... WAHA (sessão nordia-principal) e IA, ambas DISABLED

Acesso de desenvolvimento (senha única: crm@2026)
${usuarios.map((u) => `  ${u.name.padEnd(20)} ${u.email}`).join("\n")}

Pendência para testar com WhatsApp real:
  parear um número próprio da NORDIA na sessão "nordia-principal" da WAHA
  (a sessão "rise-principal" pertence à RISE e não deve ser reaproveitada).
`);
}

main()
  .catch((e) => {
    console.error("Falha no seed da NORDIA:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
