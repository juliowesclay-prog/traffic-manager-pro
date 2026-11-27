import "server-only";
import { headers } from "next/headers";
import { prefillLoginAllowed } from "@tmp/core";
import { prisma } from "@tmp/db";

/** Usuário de demonstração que vem preenchido na tela de login do painel (só em teste local). */
const DEMO_ADMIN_EMAIL = "superadmin@trafficmanager.test";

/**
 * SOMENTE TESTES LOCAIS: e-mail e senha do administrador de DEMONSTRAÇÃO já preenchidos em
 * /admin/entrar. Exige DEV_PREFILL_LOGIN=true, nunca em produção, e só quando a página é aberta
 * por localhost no próprio computador (outros aparelhos da rede não recebem a senha). A conferência
 * da senha e o autenticador continuam acontecendo no servidor.
 */
export async function devPrefilledAdminLogin(): Promise<{ email: string; password: string } | null> {
  const host = (await headers()).get("host");
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password || !prefillLoginAllowed(process.env, host)) return null;
  const user = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
    select: { isDemo: true },
  });
  return user?.isDemo ? { email: DEMO_ADMIN_EMAIL, password } : null;
}
