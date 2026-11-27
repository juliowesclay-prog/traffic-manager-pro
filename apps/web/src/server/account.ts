import "server-only";
import { validatePassword } from "@tmp/core";
import { prisma } from "@tmp/db";
import { audit } from "./audit";
import { hashPassword, verifyPasswordSafely } from "./passwords";
import { rateLimit } from "./rate-limit";

export type AccountResult = { ok: true; message: string } | { ok: false; message: string; field?: string };

export async function changePassword(
  userId: string,
  input: { current: string; next: string; confirm: string },
  kind: "member" | "staff",
): Promise<AccountResult> {
  if (!(await rateLimit(`password-change:${userId}`, 10, 15 * 60))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await verifyPasswordSafely(user, input.current))) {
    return { ok: false, field: "current", message: "A senha atual não confere." };
  }
  const policy = validatePassword(input.next, kind);
  if (!policy.ok) return { ok: false, field: "next", message: policy.error };
  if (input.next !== input.confirm)
    return { ok: false, field: "confirm", message: "As duas senhas novas não são iguais." };
  if (user.passwordHash && (await verifyPasswordSafely(user, input.next))) {
    return { ok: false, field: "next", message: "A nova senha precisa ser diferente da atual." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.next), mustChangePassword: false },
  });
  await audit({
    actorId: userId,
    action: user.passwordHash ? "user.password_changed" : "user.password_created",
    entity: "User",
    entityId: userId,
  });
  return { ok: true, message: user.passwordHash ? "Senha alterada." : "Senha criada." };
}
