/**
 * Seed base (todos os ambientes). Pode rodar várias vezes sem duplicar.
 * - Primeiro superadministrador, se SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD estiverem no ambiente
 *   (MFA é configurado obrigatoriamente no primeiro acesso).
 * Não cria empresas: o superadministrador cadastra pelo painel (Empresas).
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedFirstAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos — nenhum admin criado";
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return `admin ${email} já existe — mantido`;
  await prisma.user.create({
    data: {
      name: "Superadministrador",
      email,
      passwordHash: await hash(password),
      roles: { create: { role: "SUPERADMIN" } },
    },
  });
  await prisma.auditLog.create({
    data: { action: "user.bootstrap_admin", entity: "User", after: { email } },
  });
  return `admin ${email} criado (configure o MFA no primeiro acesso)`;
}

async function main() {
  console.warn(`Seed: ${await seedFirstAdmin()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
