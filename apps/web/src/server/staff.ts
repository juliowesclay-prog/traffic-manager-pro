import "server-only";
import QRCode from "qrcode";
import { can, generateTotpSecret, totpUri, verifyTotp } from "@tmp/core";
import { decrypt, encrypt, prisma } from "@tmp/db";
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

/** 1º fator da equipe: e-mail + senha. Abre sessão ainda SEM acesso ao painel (falta o MFA). */
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
  await createSession(user.id, { kind: "staff", mfaVerified: false });
  await audit({ actorId: user.id, action: "staff.password_ok", entity: "User", entityId: user.id });
  const base = PORTAL_BASE[area];
  return { ok: true, next: user.mfaEnabledAt ? `${base}/verificar` : `${base}/mfa/configurar` };
}

/** Prepara (ou retoma) o cadastro do aplicativo autenticador. */
export async function mfaEnrollmentData(): Promise<{ secret: string; qrDataUrl: string } | null> {
  const session = await currentSession();
  if (!session || session.user.mfaEnabledAt) return null;
  let secret: string;
  if (session.user.mfaSecretEnc) secret = decrypt(session.user.mfaSecretEnc);
  else {
    secret = generateTotpSecret();
    await prisma.user.update({ where: { id: session.userId }, data: { mfaSecretEnc: encrypt(secret) } });
  }
  const uri = totpUri(secret, session.user.email ?? session.user.name, "Traffic Manager Pro");
  return { secret, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
}

/** Confere o código do autenticador (cadastro ou login). Em caso de sucesso, troca a sessão por uma com MFA. */
export async function confirmTotp(code: string, mode: "enroll" | "verify"): Promise<ActionResult> {
  const session = await currentSession();
  const user = session?.user;
  const secretEnc = user?.mfaSecretEnc;
  if (!user || !secretEnc) return { ok: false, message: "Sua sessão expirou. Entre de novo." };
  if (mode === "enroll" && user.mfaEnabledAt)
    return { ok: false, message: "O autenticador já está configurado." };
  if (mode === "verify" && !user.mfaEnabledAt)
    return { ok: false, message: "Configure o autenticador primeiro." };
  if (!(await rateLimit(`mfa:user:${user.id}`, 5, 5 * 60))) return { ok: false, message: TOO_MANY };

  const step = verifyTotp(decrypt(secretEnc), code.replace(/\s/g, ""), Date.now(), user.mfaLastStep);
  if (step === null) {
    await audit({ actorId: user.id, action: "staff.mfa_failed", entity: "User", entityId: user.id });
    return {
      ok: false,
      message: "Código incorreto ou vencido. Digite o código que aparece agora no aplicativo.",
    };
  }
  // Grava o passo usado só se for mais novo (impede reutilizar o mesmo código, inclusive em paralelo).
  const updated = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step, ...(mode === "enroll" ? { mfaEnabledAt: new Date() } : {}) },
  });
  if (updated.count !== 1) return { ok: false, message: "Este código já foi usado. Aguarde o próximo." };

  // Nova sessão com MFA (evita fixação de sessão) e encerra a anterior.
  await destroySession();
  await createSession(user.id, { kind: "staff", mfaVerified: true });
  await audit({
    actorId: user.id,
    action: mode === "enroll" ? "staff.mfa_enrolled" : "staff.mfa_ok",
    entity: "User",
    entityId: user.id,
  });
  return {
    ok: true,
    next: "/admin",
  };
}

export async function logout(): Promise<void> {
  const session = await currentSession();
  await destroySession();
  if (session)
    await audit({ actorId: session.userId, action: "user.logout", entity: "User", entityId: session.userId });
}
