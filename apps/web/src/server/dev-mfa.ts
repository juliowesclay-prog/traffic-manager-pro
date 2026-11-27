import "server-only";
import { hotp, totpStep } from "@tmp/core";
import { decrypt } from "@tmp/db";

/**
 * SOMENTE TESTES LOCAIS: código do autenticador já preenchido para os usuários de DEMONSTRAÇÃO
 * (seed demo, e-mail @trafficmanager.test, chave igual a DEMO_MFA_SECRET). A verificação continua
 * acontecendo no servidor — só poupa digitar o código. Nunca em produção; usuários reais nunca.
 */
export function devPrefilledMfaCode(user: {
  email: string | null;
  isDemo: boolean;
  mfaSecretEnc: string | null;
  mfaLastStep: number | null;
}): string | null {
  if (process.env.APP_ENV === "production") return null;
  const demoSecret = process.env.DEMO_MFA_SECRET;
  if (!demoSecret || !user.isDemo || !user.mfaSecretEnc || !user.email?.endsWith("@trafficmanager.test")) return null;
  let secret: string;
  try {
    secret = decrypt(user.mfaSecretEnc);
  } catch {
    return null;
  }
  if (secret !== demoSecret) return null;
  // Um código só vale uma vez: se o atual já foi usado, entrega o próximo (aceito pela janela de ±30 s).
  const current = totpStep(Date.now());
  const step = Math.max(current, (user.mfaLastStep ?? -1) + 1);
  return step <= current + 1 ? hotp(secret, step) : null;
}
