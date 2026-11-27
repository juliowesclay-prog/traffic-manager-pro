import { expect, test } from "@playwright/test";
import { prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Entrega 8.4 — painel do gestor: KPIs com comparação, gráfico diário com tabela, ranking dos
 * anúncios e alertas (Meta SIMULADA, dados DEMO). Os alertas só avisam: nada muda na Meta.
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Gestor de Tráfego: precisa de META_PROVIDER=simulado");
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";

test.beforeEach(async ({ page }) => {
  await resetRateLimits();
  await staffLogin(page, "marketing@trafficmanager.test");
});

test.describe("Gestor de Tráfego IA: painel", () => {
  test("sem conta escolhida, o painel manda para a Conexão", async ({ page }) => {
    await prisma.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } });
    await prisma.metaConnection.updateMany({
      where: { status: "ATIVA" },
      data: { status: "DESCONECTADA", tokenEnc: null, disconnectedAt: new Date() },
    });
    await page.goto("/admin/trafego/painel");
    await expect(page.getByText("Conecte a Meta e escolha a conta")).toBeVisible();
    await page.getByRole("link", { name: "Ir para Conexão" }).click();
    await expect(page).toHaveURL(/\/admin\/trafego$/);
  });

  test("KPIs batem com Vendas por anúncio; gráfico com tabela; ranking; período", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/admin/trafego");
    await page.getByRole("button", { name: "Conectar com a Meta" }).click();
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await page.getByTestId(`conta-${ACCOUNT}`).getByRole("button").click();
    await expect(page.getByTestId(`conta-${ACCOUNT}`)).toContainText("em uso");
    await page.goto("/admin/trafego/campanhas");
    await page.getByRole("button", { name: "Atualizar agora" }).click();
    await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });

    // A aba Painel abre o painel; padrão 7 dias.
    await page.getByRole("link", { name: "Painel", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/trafego\/painel$/);
    await expect(page.getByRole("note")).toContainText("DEMO");
    await expect(page.getByRole("link", { name: "Últimos 7 dias" })).toHaveAttribute("aria-current", "true");

    // 30 dias: os números são os mesmos da aba Vendas por anúncio no mesmo período.
    await page.getByRole("link", { name: "Últimos 30 dias" }).click();
    await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute("aria-current", "true");
    const kpi = async (id: string) => Number(await page.getByTestId(id).getAttribute("data-valor"));
    const spend = await kpi("painel-investido");
    const sales = await kpi("painel-vendas");
    expect(spend).toBeGreaterThan(0);
    await expect(page.getByTestId("painel-investido")).toContainText("vs período anterior");

    // Gráfico acessível + mesma informação em tabela (30 linhas, soma = investido).
    const chart = page.getByRole("img", { name: /Investido e vendas por dia:/ });
    await expect(chart).toBeVisible();
    await page.getByText("Ver em tabela").click();
    const rows = page.getByRole("region", { name: /em tabela/ }).locator("tbody tr");
    await expect(rows).toHaveCount(30);

    // Ranking: lista dos que gastam sem vender (DEMO tem investimento) com miniatura ou ícone.
    const worst = page.getByTestId("ranking-piores");
    await expect(worst.getByRole("listitem").first()).toBeVisible();
    for (const img of await page.locator("img[src*='fbcdn']").all())
      await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");

    await page.goto("/admin/trafego/vendas?periodo=30");
    expect(Number(await page.getByTestId("vendas-investido").getAttribute("data-valor"))).toBe(spend);
    expect(Number(await page.getByTestId("vendas-vendas").getAttribute("data-valor"))).toBe(sales);
  });

  test("alertas: anúncio reprovado e conexão vencendo aparecem no topo; nada muda na Meta", async ({
    page,
  }) => {
    const conn = await prisma.metaConnection.findFirstOrThrow({ where: { status: "ATIVA" } });
    // O anúncio com mais gasto no período fica "reprovado" na cópia local.
    const top = await prisma.metaInsightDaily.groupBy({
      by: ["objectId"],
      where: { accountId: ACCOUNT, level: "ANUNCIO" },
      _sum: { spend: true },
      orderBy: { _sum: { spend: "desc" } },
      take: 1,
    });
    const adId = top[0]!.objectId;
    const ad = await prisma.metaAd.findFirstOrThrow({ where: { accountId: ACCOUNT, externalId: adId } });
    await prisma.metaAd.update({ where: { id: ad.id }, data: { effectiveStatus: "DISAPPROVED" } });
    await prisma.metaConnection.update({
      where: { id: conn.id },
      data: { tokenExpiresAt: new Date(Date.now() + 3 * 86_400_000) },
    });
    try {
      await page.goto("/admin/trafego/painel?periodo=30");
      const alerts = page.getByTestId("alertas").getByRole("listitem");
      await expect(page.getByTestId(`alerta-problema-${adId}`)).toContainText("Reprovado pela Meta");
      await expect(page.getByTestId("alerta-conexao")).toContainText(/vence em [23] dia/);
      // Os de nível alto vêm primeiro.
      const first = await alerts.first().getAttribute("data-testid");
      expect(["alerta-conexao", `alerta-problema-${adId}`]).toContain(first);
      await expect(page.getByText("Os alertas só avisam; nada é alterado na Meta.")).toBeVisible();
    } finally {
      await prisma.metaAd.update({ where: { id: ad.id }, data: { effectiveStatus: ad.effectiveStatus } });
      await prisma.metaConnection.update({
        where: { id: conn.id },
        data: { tokenExpiresAt: conn.tokenExpiresAt },
      });
    }
  });

  test("miniaturas da Meta liberadas no CSP; sem empresa não abre o painel", async ({ page, browser }) => {
    const res = await page.goto("/admin/trafego/painel");
    expect(res!.headers()["content-security-policy"]).toContain(
      "img-src 'self' data: blob: https://*.fbcdn.net",
    );
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await staffLogin(p, "semempresa@trafficmanager.test");
    await p.goto("/admin/trafego/painel");
    await expect(p).toHaveURL(/\/admin\/sem-empresa$/);
    await ctx.close();
  });
});
