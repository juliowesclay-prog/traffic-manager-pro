import { createHash, randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { totp } from "@tmp/core";
import { prisma } from "@tmp/db";

/** Utilidades dos testes E2E. Só funcionam contra o banco de DESENVOLVIMENTO (dados DEMO). */

/** Empresas DEMO com IDs fixos (pnpm db:seed:demo). */
export const DEMO_COMPANY_A = "00000000-0000-4000-8000-00000000000a";
export const DEMO_COMPANY_B = "00000000-0000-4000-8000-00000000000b";

/** Zera os limites de tentativas (somente banco de desenvolvimento). */
export async function resetRateLimits() {
  if (process.env.APP_ENV === "production") throw new Error("nunca em produção");
  await prisma.rateLimitBucket.deleteMany({});
}

export const DEMO_PASSWORD = () => process.env.DEMO_USER_PASSWORD!;
export const demoTotp = () => totp(process.env.DEMO_MFA_SECRET!, Date.now());

/** Login completo de equipe de demonstração (senha + MFA). Abre a Empresa A, se o usuário puder. */
export async function staffLogin(page: Page, email: string, company: string = DEMO_COMPANY_A) {
  // Só nos testes: libera reutilizar o código TOTP da janela atual (a proteção contra reuso é testada à parte).
  const user = await prisma.user.update({ where: { email }, data: { mfaLastStep: null } });
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(DEMO_PASSWORD());
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/admin\/verificar$/);
  await page.getByLabel(/Código de 6 números/).fill(demoTotp());
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/admin(\/trafego|\/conta|\/sem-empresa)?$/);
  // Sessão recém-criada: aponta para a empresa pedida (o seletor no menu faz o mesmo pela tela).
  const session = await prisma.session.findFirstOrThrow({
    where: { userId: user.id, revokedAt: null, mfaVerified: true },
    orderBy: { createdAt: "desc" },
  });
  const allowed =
    (await prisma.userRole.count({ where: { userId: user.id, role: "SUPERADMIN" } })) > 0 ||
    (await prisma.companyMember.count({ where: { userId: user.id, companyId: company } })) > 0;
  if (allowed) await prisma.session.update({ where: { id: session.id }, data: { activeCompanyId: company } });
}

/** Cria uma chave da API da fonte de vendas direto no banco (o fluxo pela tela é testado à parte). */
export async function createTestApiKey(companyId: string = DEMO_COMPANY_A) {
  const id = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const prefix = `tmp_${id}`;
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@trafficmanager.test" } });
  await prisma.apiKey.create({
    data: {
      companyId,
      name: "E2E",
      prefix,
      secretHash: createHash("sha256")
        .update(`${process.env.HASH_PEPPER ?? ""}:api-key:${secret}`)
        .digest("hex"),
      createdById: admin.id,
    },
  });
  return `${prefix}_${secret}`;
}

/** Envia eventos para a API da fonte de vendas. */
export async function sendEvents(request: APIRequestContext, key: string, body: unknown) {
  const res = await request.post("/api/v1/eventos", {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: body,
  });
  return { status: res.status(), json: (await res.json()) as { itens?: { status: string; erro?: string }[]; erro?: string } };
}

/** Apaga os leads/vendas DEMO de uma empresa (só desenvolvimento). */
export async function resetSalesSource(companyId: string = DEMO_COMPANY_A) {
  if (process.env.APP_ENV === "production") throw new Error("nunca em produção");
  await prisma.metaConversionEvent.deleteMany({ where: { companyId } });
  await prisma.sale.deleteMany({ where: { companyId } });
  await prisma.lead.deleteMany({ where: { companyId } });
}

export { prisma };
