/**
 * Dados de DEMONSTRAÇÃO para desenvolvimento e testes E2E. Recusa rodar em produção.
 * - Duas empresas DEMO (para provar a separação dos dados entre empresas).
 * - Um usuário por perfil (e-mail @trafficmanager.test) com a senha DEMO_USER_PASSWORD.
 *   Tudo marcado isDemo.
 * - O marketing só enxerga a Empresa A; o superadministrador enxerga as duas.
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient, type Role } from "@prisma/client";

if (process.env.APP_ENV === "production") {
  console.error("seed-demo recusado: APP_ENV=production");
  process.exit(1);
}

const prisma = new PrismaClient();

/** IDs fixos (os testes E2E usam para conferir a separação entre empresas). */
export const DEMO_COMPANY_A = "00000000-0000-4000-8000-00000000000a";
export const DEMO_COMPANY_B = "00000000-0000-4000-8000-00000000000b";
const COMPANIES = [
  { id: DEMO_COMPANY_A, slug: "demo-empresa-a", name: "DEMO Empresa A" },
  { id: DEMO_COMPANY_B, slug: "demo-empresa-b", name: "DEMO Empresa B" },
];

const STAFF: { email: string; name: string; role: Role; companies: string[] }[] = [
  { email: "superadmin@trafficmanager.test", name: "DEMO Superadmin", role: "SUPERADMIN", companies: [] },
  {
    email: "gestor@trafficmanager.test",
    name: "DEMO Gestor de tráfego",
    role: "GESTOR",
    companies: ["demo-empresa-a", "demo-empresa-b"],
  },
  { email: "marketing@trafficmanager.test", name: "DEMO Marketing", role: "MARKETING", companies: ["demo-empresa-a"] },
  { email: "leitura@trafficmanager.test", name: "DEMO Leitura", role: "LEITURA", companies: ["demo-empresa-a"] },
  // Sem nenhuma empresa liberada (testa o bloqueio).
  { email: "semempresa@trafficmanager.test", name: "DEMO Sem empresa", role: "MARKETING", companies: [] },
];

/** --so-empresas: só as empresas DEMO, sem usuários (prévia na internet: entra só o superadmin real). */
const ONLY_COMPANIES = process.argv.includes("--so-empresas");

async function main() {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!ONLY_COMPANIES && (!password || password.length < 12)) {
    throw new Error("Defina DEMO_USER_PASSWORD (12+ caracteres) no .env (pnpm env:init)");
  }
  const companyIds = new Map<string, string>();
  for (const c of COMPANIES) {
    const row = await prisma.company.upsert({
      where: { slug: c.slug },
      update: {},
      create: { ...c, isDemo: true },
    });
    companyIds.set(c.slug, row.id);
  }
  if (ONLY_COMPANIES || !password) {
    console.warn(`Seed demo: ${COMPANIES.length} empresas DEMO (sem usuários de demonstração).`);
    return;
  }
  const passwordHash = await hash(password);
  for (const s of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      create: {
        email: s.email,
        name: s.name,
        passwordHash,
        isDemo: true,
        roles: { create: { role: s.role } },
      },
    });
    for (const slug of s.companies)
      await prisma.companyMember.upsert({
        where: { companyId_userId: { companyId: companyIds.get(slug)!, userId: user.id } },
        update: {},
        create: { companyId: companyIds.get(slug)!, userId: user.id },
      });
  }
  console.warn(`Seed demo: ${COMPANIES.length} empresas DEMO e ${STAFF.length} usuários DEMO.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
