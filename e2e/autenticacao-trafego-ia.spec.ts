import { expect, test, type Page } from "@playwright/test";
import { prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Entrega 8.5 — IA analista (SIMULADA, dados DEMO): pedir análise, ver diagnóstico e sugestões, travas
 * (alvo inventado descartado), erro da IA, limite de uso e o que é enviado (sem dados de clientes).
 */
test.skip(
  process.env.META_PROVIDER !== "simulado" || process.env.AI_PROVIDER !== "simulado",
  "IA analista: precisa de META_PROVIDER=simulado e AI_PROVIDER=simulado",
);
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const FAIL_KEY = "simulado.ia.falha";

async function setFailure(value: string | null) {
  if (value === null) await prisma.setting.deleteMany({ where: { key: FAIL_KEY } });
  else
    await prisma.setting.upsert({
      where: { key: FAIL_KEY },
      create: { key: FAIL_KEY, value },
      update: { value },
    });
}

async function ensureDemoAccount(page: Page) {
  await page.goto("/admin/trafego");
  const inUse = page.getByTestId(`conta-${ACCOUNT}`).getByText("em uso");
  if (!(await inUse.count())) {
    await prisma.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } });
    await prisma.metaConnection.updateMany({
      where: { status: "ATIVA" },
      data: { status: "DESCONECTADA", tokenEnc: null, disconnectedAt: new Date() },
    });
    await page.goto("/admin/trafego");
    await page.getByRole("button", { name: "Conectar com a Meta" }).click();
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await page.getByTestId(`conta-${ACCOUNT}`).getByRole("button").click();
    await expect(page.getByTestId(`conta-${ACCOUNT}`)).toContainText("em uso");
  }
  await page.goto("/admin/trafego/campanhas");
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });
}

async function ask(page: Page, days: number) {
  await page.goto("/admin/trafego/ia");
  await page.getByLabel("Período analisado").selectOption(String(days));
  await page.getByRole("button", { name: "Pedir análise" }).click();
}

test.beforeEach(async ({ page }) => {
  await resetRateLimits();
  await setFailure(null);
  await prisma.trafficAnalysis.deleteMany({ where: { accountId: ACCOUNT, status: "EXECUTANDO" } });
  await staffLogin(page, "marketing@trafficmanager.test");
});
test.afterAll(async () => setFailure(null));

test.describe("Gestor de Tráfego IA: IA analista", () => {
  test("pede análise: diagnóstico, sugestões, histórico, auditoria e nada de dados pessoais", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await ensureDemoAccount(page);
    await page.getByRole("link", { name: "IA analista" }).click();
    await expect(page.getByText("Nenhum dado pessoal de cliente")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("IA simulada");

    await ask(page, 30);
    await expect(page).toHaveURL(/\/admin\/trafego\/ia\?analise=[0-9a-f-]{36}$/);
    const id = new URL(page.url()).searchParams.get("analise")!;
    await expect(page.getByRole("heading", { name: "Análise dos últimos 30 dias" })).toBeVisible();
    await expect(page.getByTestId("analise-resumo")).toContainText("DEMO");
    await expect(page.getByTestId("sugestao-0")).toBeVisible();

    // O que foi enviado: números agregados e nomes de anúncios; nenhum CPF, e-mail ou telefone.
    await page.getByText("Ver os dados enviados à IA").click();
    const sent = (await page.getByTestId("dados-enviados").textContent()) ?? "";
    expect(sent).toContain('"periodo"');
    expect(sent).toContain('"anuncios"');
    expect(sent).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF formatado
    expect(sent).not.toMatch(/@/); // e-mail
    expect(sent).not.toMatch(/\(\d{2}\)\s?9\d{4}-?\d{4}/); // celular formatado
    // Nenhum código de cliente da fonte de vendas (os IDs longos são de campanhas e anúncios da Meta).
    const leads = await prisma.lead.findMany({ select: { externalId: true }, take: 50, orderBy: { receivedAt: "desc" } });
    for (const l of leads) expect(sent).not.toContain(l.externalId);
    expect(JSON.parse(sent)).not.toHaveProperty("clientes");

    const row = await prisma.trafficAnalysis.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "OK", provider: "simulado", periodDays: 30, isDemo: true });
    expect(await prisma.auditLog.count({ where: { action: "traffic.ai_analysis", entityId: id } })).toBe(1);
    await expect(page.getByTestId("historico").getByRole("link").first()).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("trava: sugestão com anúncio inventado é descartada e mostrada à parte", async ({ page }) => {
    await setFailure("alvo_inventado");
    await ask(page, 7);
    await expect(page).toHaveURL(/analise=/);
    await expect(page.getByTestId("descartadas")).toContainText("Sugestões descartadas pelas travas (1)");
    await page.getByText("Sugestões descartadas pelas travas").click();
    await expect(page.getByTestId("descartadas")).toContainText("não existe nos dados");
    await expect(page.getByTestId("analise")).not.toContainText("999999999999999");
  });

  test("erro da IA aparece claro e fica no histórico; nada é cobrado em dobro", async ({ page }) => {
    await setFailure("erro");
    await ask(page, 14);
    await expect(page.getByRole("alert").first()).toContainText("A IA não respondeu");
    await page.goto("/admin/trafego/ia");
    await expect(page.getByTestId("historico").getByText("não concluída").first()).toBeVisible();
    expect(await prisma.trafficAnalysis.count({ where: { accountId: ACCOUNT, status: "EXECUTANDO" } })).toBe(
      0,
    );
  });

  test("limite de análises por hora", async ({ page }) => {
    test.setTimeout(120_000);
    for (let i = 0; i < 5; i++) {
      await ask(page, 7);
      await expect(page).toHaveURL(/analise=/);
    }
    await ask(page, 7);
    await expect(page.getByRole("alert").first()).toContainText("Muitas análises seguidas");
  });

  test("sem empresa não abre a IA analista", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await staffLogin(p, "semempresa@trafficmanager.test");
    await p.goto("/admin/trafego/ia");
    await expect(p).toHaveURL(/\/admin\/sem-empresa$/);
    await ctx.close();
  });
});
