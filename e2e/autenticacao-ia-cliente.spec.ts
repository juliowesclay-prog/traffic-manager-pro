import { expect, test, type Page } from "@playwright/test";
import { DEMO_COMPANY_A, prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * IA do próprio cliente: a empresa cadastra a chave de API do ChatGPT/Claude (teste simulado, sem
 * internet: chaves "...DEMOOK"), a chave fica cifrada e só os 4 últimos caracteres aparecem, a IA
 * analista passa a usar essa chave, e ao remover volta para a IA da plataforma.
 */
test.skip(
  process.env.META_PROVIDER !== "simulado" ||
    process.env.AI_PROVIDER !== "simulado" ||
    process.env.AI_KEY_TEST_MODE !== "simulado",
  "precisa de META_PROVIDER, AI_PROVIDER e AI_KEY_TEST_MODE = simulado",
);
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const GOOD = "sk-proj-e2eTESTE0123456789abcDEMOOK";
const clean = () => prisma.aiCredential.deleteMany({ where: { companyId: DEMO_COMPANY_A } });

test.beforeAll(async () => {
  await clean();
  await resetRateLimits();
});
test.afterAll(clean);

async function ensureDemoAccount(page: Page) {
  await page.goto("/admin/trafego");
  const acc = page.getByTestId(`conta-${ACCOUNT}`);
  if (!(await acc.getByText("em uso").count())) {
    const connect = page.getByRole("button", { name: "Conectar com a Meta" });
    if (await connect.isVisible()) {
      await connect.click();
      await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    }
    await acc.getByRole("button").click();
    await expect(acc).toContainText("em uso");
  }
  await page.goto("/admin/trafego/campanhas");
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });
}

test("cadastra a chave do ChatGPT: passo a passo, teste, chave cifrada e auditoria", async ({ page }) => {
  await staffLogin(page, "gestor@trafficmanager.test");
  await page.goto("/admin/trafego/painel");
  await page.getByRole("link", { name: "Inteligência artificial" }).click();
  await expect(page).toHaveURL(/\/admin\/ia$/);
  await expect(page.getByTestId("ia-situacao")).toContainText("IA da plataforma");

  const form = page.getByTestId("form-chave-ia");
  await form.getByLabel("Qual inteligência artificial sua empresa usa").selectOption("openai");
  await expect(page.getByTestId("passo-a-passo")).toContainText("platform.openai.com");
  await expect(page.getByTestId("passo-a-passo")).toContainText("Login e senha");
  await expect(page.getByTestId("passo-a-passo")).toContainText("Coloque créditos e um limite de gasto");
  await expect(page.getByTestId("ia-como-funciona")).toContainText("Antes de começar");
  await expect(page.getByTestId("ia-custos")).toContainText("só o que usar");
  await page.getByText("Já pago o ChatGPT Plus ou o Claude Pro. Serve?").click();
  await expect(page.getByTestId("ia-duvidas")).toContainText("conta de desenvolvedor");

  // Chave do Claude no campo do ChatGPT e chave recusada no teste: nada é salvo.
  await form.getByLabel("Chave de API").fill("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
  await form.getByRole("button", { name: "Salvar e testar" }).click();
  await expect(form.getByText(/chave do Claude/)).toBeVisible();
  await form.getByLabel("Chave de API").fill("sk-proj-e2eTESTE0123456789abcWRONGX");
  await form.getByRole("button", { name: "Salvar e testar" }).click();
  await expect(form.getByText(/recusada/)).toBeVisible();
  expect(await prisma.aiCredential.count({ where: { companyId: DEMO_COMPANY_A } })).toBe(0);

  await form.getByLabel("Chave de API").fill(GOOD);
  await form.getByRole("button", { name: "Salvar e testar" }).click();
  await expect(form.getByText(/testada e salva/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("ia-situacao")).toContainText("ChatGPT (OpenAI)");
  await expect(page.getByTestId("ia-situacao")).toContainText("…MOOK");
  expect(await page.content()).not.toContain(GOOD);

  const row = await prisma.aiCredential.findFirstOrThrow({ where: { companyId: DEMO_COMPANY_A } });
  expect(row).toMatchObject({ provider: "openai", keyHint: "MOOK", model: "gpt-5.1" });
  expect(row.keyEnc).not.toContain(GOOD);
  expect(
    await prisma.auditLog.count({ where: { action: "ai.key_added", companyId: DEMO_COMPANY_A } }),
  ).toBeGreaterThan(0);
  const audits = await prisma.auditLog.findMany({
    where: { action: "ai.key_added" },
    select: { after: true },
  });
  expect(JSON.stringify(audits)).not.toContain(GOOD);

  // Trocar só o modelo, sem colar a chave de novo.
  await form.getByLabel("Modelo").selectOption("gpt-4o");
  await form.getByRole("button", { name: "Salvar e testar" }).click();
  await expect(form.getByText(/Modelo: gpt-4o/)).toBeVisible();
});

test("perfil Marketing vê a situação mas não mexe na chave", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/ia");
  await expect(page.getByTestId("ia-situacao")).toContainText("chave da sua empresa");
  await expect(page.getByTestId("form-chave-ia")).toHaveCount(0);
  await expect(page.getByText("Só o Gestor de tráfego ou o Superadministrador")).toBeVisible();
});

test("a IA analista usa a chave da empresa; remover volta para a IA da plataforma", async ({ page }) => {
  test.setTimeout(120_000);
  await staffLogin(page, "gestor@trafficmanager.test");
  await ensureDemoAccount(page);
  await page.goto("/admin/trafego/ia");
  await expect(page.getByTestId("ia-em-uso")).toContainText("ChatGPT da sua empresa (gpt-4o)");
  await page.getByLabel("Período analisado").selectOption("30");
  await page.getByRole("button", { name: "Pedir análise" }).click();
  await expect(page).toHaveURL(/\/admin\/trafego\/ia\?analise=[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = new URL(page.url()).searchParams.get("analise")!;
  const a = await prisma.trafficAnalysis.findUniqueOrThrow({ where: { id } });
  expect(a).toMatchObject({ status: "OK", provider: "openai", model: "gpt-4o", isDemo: true });
  await expect(page.getByText("ChatGPT (gpt-4o)")).toBeVisible();

  await page.goto("/admin/ia");
  await page.getByRole("button", { name: "Remover a chave" }).click();
  await expect(page.getByText(/Chave removida/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("ia-situacao")).toContainText("IA da plataforma");
  await page.goto("/admin/trafego/ia");
  await expect(page.getByTestId("ia-em-uso")).toContainText("IA da plataforma");
});
