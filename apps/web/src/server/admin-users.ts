import "server-only";
import { randomBytes } from "node:crypto";
import { normalizeEmail, ROLE_LABELS, type Role } from "@tmp/core";
import { Prisma, prisma } from "@tmp/db";
import { audit } from "./audit";
import { hashPassword } from "./passwords";

/** Perfis que o painel atribui. */
export const ASSIGNABLE_ROLES = ["SUPERADMIN", "GESTOR", "MARKETING", "LEITURA"] as const satisfies readonly Role[];
type StaffRole = (typeof ASSIGNABLE_ROLES)[number];

export type AdminResult =
  { ok: true; message: string; tempPassword?: string } | { ok: false; message: string };

const tempPassword = () => randomBytes(12).toString("base64url"); // 16 caracteres

function parseRoles(input: string[]): StaffRole[] {
  return [...new Set(input)].filter((r): r is StaffRole =>
    (ASSIGNABLE_ROLES as readonly string[]).includes(r),
  );
}

export async function listStaff() {
  return prisma.user.findMany({
    where: { roles: { some: {} } },
    include: { roles: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

/** Superadmins ativos com MFA, exceto o informado — nunca deixar o sistema sem administrador. */
async function otherActiveSuperadmins(excludeUserId: string) {
  return prisma.user.count({
    where: { id: { not: excludeUserId }, status: "ACTIVE", roles: { some: { role: "SUPERADMIN" } } },
  });
}

export async function createStaff(
  actorId: string,
  input: { name: string; email: string; roles: string[] },
): Promise<AdminResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 80)
    return { ok: false, message: "Informe o nome (3 a 80 caracteres)." };
  const email = normalizeEmail(input.email);
  if (!email || email === "invalid") return { ok: false, message: "Informe um e-mail válido." };
  const roles = parseRoles(input.roles);
  if (!roles.length) return { ok: false, message: "Escolha pelo menos um perfil." };

  const password = tempPassword();
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    await audit({
      actorId,
      action: "staff.created",
      entity: "User",
      entityId: user.id,
      after: { email, roles },
    });
    return { ok: true, message: `Usuário ${name} criado.`, tempPassword: password };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Já existe um usuário com este e-mail." };
    }
    throw error;
  }
}

export async function updateRoles(actorId: string, userId: string, input: string[]): Promise<AdminResult> {
  if (actorId === userId)
    return {
      ok: false,
      message: "Você não pode alterar os próprios perfis. Peça a outro superadministrador.",
    };
  const roles = parseRoles(input);
  if (!roles.length) return { ok: false, message: "Escolha pelo menos um perfil (ou bloqueie o usuário)." };
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user) return { ok: false, message: "Usuário não encontrado." };
  const before = user.roles.map((r) => r.role);
  if (
    before.includes("SUPERADMIN") &&
    !roles.includes("SUPERADMIN") &&
    (await otherActiveSuperadmins(userId)) === 0
  ) {
    return {
      ok: false,
      message: "Este é o único superadministrador ativo. Crie outro antes de remover este perfil.",
    };
  }
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId, role: { in: [...ASSIGNABLE_ROLES] } } }),
    prisma.userRole.createMany({ data: roles.map((role) => ({ userId, role })) }),
    // Perfis mudaram: encerra as sessões para valerem as novas permissões já no próximo acesso.
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({
    actorId,
    action: "staff.roles_changed",
    entity: "User",
    entityId: userId,
    before,
    after: roles,
  });
  return { ok: true, message: `Perfis atualizados: ${roles.map((r) => ROLE_LABELS[r]).join(", ")}.` };
}

export async function setBlocked(actorId: string, userId: string, blocked: boolean): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, message: "Você não pode bloquear a própria conta." };
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user) return { ok: false, message: "Usuário não encontrado." };
  if (
    blocked &&
    user.roles.some((r) => r.role === "SUPERADMIN") &&
    (await otherActiveSuperadmins(userId)) === 0
  ) {
    return { ok: false, message: "Não é possível bloquear o único superadministrador ativo." };
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status: blocked ? "BLOCKED" : "ACTIVE", lockedUntil: null, failedLoginCount: 0 },
    }),
    ...(blocked
      ? [prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]
      : []),
  ]);
  await audit({
    actorId,
    action: blocked ? "staff.blocked" : "staff.unblocked",
    entity: "User",
    entityId: userId,
  });
  return { ok: true, message: blocked ? "Usuário bloqueado e desconectado." : "Usuário desbloqueado." };
}

/** Para quem perdeu o celular do autenticador: no próximo acesso configura de novo. */
export async function resetMfa(actorId: string, userId: string): Promise<AdminResult> {
  if (actorId === userId)
    return { ok: false, message: "Peça a outro superadministrador para reiniciar o seu autenticador." };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null },
    }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId, action: "staff.mfa_reset", entity: "User", entityId: userId });
  return { ok: true, message: "Autenticador reiniciado. No próximo acesso a pessoa vai configurar de novo." };
}

export async function resetPassword(actorId: string, userId: string): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, message: "Para trocar a sua senha, use “Minha senha”." };
  const password = tempPassword();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        lockedUntil: null,
        failedLoginCount: 0,
      },
    }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId, action: "staff.password_reset", entity: "User", entityId: userId });
  return { ok: true, message: "Senha provisória gerada.", tempPassword: password };
}
