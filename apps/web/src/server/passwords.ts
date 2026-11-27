import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { prisma, type User } from "@tmp/db";

/** Argon2id com os parâmetros padrão recomendados pela biblioteca. */
export const hashPassword = (password: string) => hash(password);

// Hash fixo para gastar o mesmo tempo quando o usuário não existe (evita descobrir e-mails pelo tempo de resposta).
let dummyHash: Promise<string> | null = null;

export async function verifyPasswordSafely(user: Pick<User, "passwordHash"> | null, password: string) {
  if (!user?.passwordHash) {
    dummyHash ??= hash("senha-inexistente-para-tempo-constante");
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(user.passwordHash, password).catch(() => false);
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(user: Pick<User, "lockedUntil">): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

/** Conta erro de senha; na 5ª seguida bloqueia a conta por 15 minutos. */
export async function registerFailedLogin(user: Pick<User, "id">) {
  // Incremento atômico no banco: tentativas em paralelo não "perdem" contagem.
  const { failedLoginCount } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (failedLoginCount < MAX_FAILED_LOGINS) return false;
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
  });
  return true;
}

export async function registerSuccessfulLogin(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}
