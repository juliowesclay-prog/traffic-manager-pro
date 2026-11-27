import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, resetRateLimits } from "./helpers";

/** Login da equipe só com e-mail e senha (a verificação em duas etapas foi retirada em 27/11/2026). */
test.beforeEach(async () => {
  await resetRateLimits();
});

test("entra direto no painel com e-mail e senha, sem código do autenticador", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.getByText(/autenticador/i)).toHaveCount(0);
  await page.getByLabel("E-mail").fill("superadmin@trafficmanager.test");
  await page.getByLabel("Senha").fill(DEMO_PASSWORD());
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/admin(\/trafego)?$/);
  // Links antigos da verificação voltam para o painel.
  await page.goto("/admin/verificar");
  await expect(page).toHaveURL(/\/admin(\/trafego)?$/);
  await page.goto("/admin/mfa/configurar");
  await expect(page).toHaveURL(/\/admin(\/trafego)?$/);
});

test("senha errada continua barrada e não abre o painel", async ({ page }) => {
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill("superadmin@trafficmanager.test");
  await page.getByLabel("Senha").fill("senha-errada-123456");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});
