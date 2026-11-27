import "server-only";
import { can } from "@tmp/core";
import { prisma } from "@tmp/db";
import { audit } from "./audit";
import { isLocked, registerFailedLogin, registerSuccessfulLogin, verifyPasswordSafely } from "./passwords";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./request";
import { createSession, currentSession, destroySession } from "./session";

export type ActionResult = { ok: true; next?: string } | { ok: false; message: string };

/** Área com login próprio: o painel. */
export type PortalArea = "admin";
export const PORTAL_BASE: Record<PortalArea, string> = { admin: "/admin" };
const AREA_PERMISSION = { admin: "admin:access" } as const;

const GENERIC = "E-mail ou senha incorretos.";
const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";

/** Login da equipe: e-mail + senha. Abre a sessão do painel. */
export async function staffPasswordLogin(
  emailInput: string,
  password: string,
  area: PortalArea = "admin",
): Promise<ActionResult> {
  const email = emailInput.trim().toLowerCase();
  const ip = await clientIp();
  if (
    !(await rateLimit(`staff-login:ip:${ip}`, 20, 15 * 60)) ||
    !(await rateLimit(`staff-login:email:${email}`, 10, 15 * 60))
  ) {
    return { ok: false, message: TOO_MANY };
  }
  const user = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  const roles = user?.roles.map((r) => r.role) ?? [];
  if (user && isLocked(user)) {
    await audit({ actorId: user.id, action: "staff.login_blocked", entity: "User", entityId: user.id });
    return {
      ok: false,
      message: "Conta bloqueada temporariamente por várias tentativas. Tente em 15 minutos.",
    };
  }
  const valid = await verifyPasswordSafely(user, password);
  if (!user || !valid || user.status !== "ACTIVE" || !can(roles, AREA_PERMISSION[area])) {
    if (user) {
      const locked = await registerFailedLogin(user);
      await audit({
        actorId: user.id,
        action: locked ? "staff.login_locked" : "staff.login_failed",
        entity: "User",
        entityId: user.id,
      });
    }
    return { ok: false, message: GENERIC };
  }
  await registerSuccessfulLogin(user.id);
  // Uma sessão anterior neste navegador é encerrada (evita fixação de sessão).
  await destroySession();
  await createSession(user.id, { kind: "staff", mfaVerified: true });
  await audit({ actorId: user.id, action: "staff.login_ok", entity: "User", entityId: user.id });
  return { ok: true, next: PORTAL_BASE[area] };
}

export async function logout(): Promise<void> {
  const session = await currentSession();
  await destroySession();
  if (session)
    await audit({ actorId: session.userId, action: "user.logout", entity: "User", entityId: session.userId });
}
