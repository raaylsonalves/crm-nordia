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

  // A sessão "rise-principal" foi pareada durante o desenvolvimento com o
  // número +55 85 99133-1364 — que na prática é o número da NORDIA, não da
  // RISE (decisão de 15/08/2026). Em vez de reparear com outro nome, a
  // NORDIA passa a ser a dona dessa sessão; a RISE fica em standby
  // (ver packages/db/prisma/seed.ts). O nome "rise-principal" ficou
  // desalinhado do que ele representa — renomear exigiria reparear o
  // WhatsApp de novo, então fica como está até valer a pena o custo.
  for (const provider of [IntegrationProvider.WAHA, IntegrationProvider.AI]) {
    await prisma.integration.create({
      data: {
        organizationId: org.id,
        provider,
        mode: provider === IntegrationProvider.WAHA ? IntegrationMode.LIVE : IntegrationMode.DISABLED,
        config:
          provider === IntegrationProvider.WAHA
            ? { baseUrl: "http://localhost:3001", session: "rise-principal" }
            : { model: "claude-sonnet-5" },
        status: provider === IntegrationProvider.WAHA ? "aguardando pareamento" : "desconectado",
        statusMessage:
          provider === IntegrationProvider.WAHA
            ? "Sessão rise-principal (número real da NORDIA) aguardando parear."
            : "Integração não configurada. Informe as credenciais em Admin → Integrações.",
      },
    });
  }

  console.log(`
Seed concluído — NORDIA Tech
  organização ......... ${org.name} (${org.slug})
  representantes ....... ${usuarios.map((u) => u.name).join(", ")}
  fila ................. ${fila.name}
  integração WAHA ...... sessão rise-principal · modo LIVE · aguardando pareamento
  integração IA ........ DISABLED

Acesso de desenvolvimento (senha única: crm@2026)
${usuarios.map((u) => `  ${u.name.padEnd(20)} ${u.email}`).join("\n")}

A sessão "rise-principal" usa o número real da NORDIA (+55 85 99133-1364).
Parear em WhatsApp → Aparelhos conectados → Conectar com número de telefone.
`);
}

main()
  .catch((e) => {
    console.error("Falha no seed da NORDIA:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
