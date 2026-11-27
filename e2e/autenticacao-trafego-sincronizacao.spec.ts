import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { prisma, resetRateLimits, staffLogin } from "./helpers";

/** Entrega 8.2 — sincronização dos anúncios (Meta SIMULADA, dados DEMO). Testes em série. */
test.skip(process.env.META_PROVIDER !== "simulado", "Gestor de Tráfego: precisa de META_PROVIDER=simulado");

const ACCOUNT = "act_1000000000000001";
const VENDAS = "2380000000000001";

async function clearSync() {
  await prisma.setting.deleteMany({ where: { key: { in: ["simulado.meta.falhas", "traffic.sync"] } } });
  await prisma.metaSyncRun.deleteMany({});
  await prisma.metaInsightDaily.deleteMany({});
  await prisma.metaAd.deleteMany({});
  await prisma.metaAdSet.deleteMany({});
  await prisma.metaCampaign.deleteMany({});
  await prisma.metaCreative.deleteMany({});
}

test.beforeEach(async () => {
  await resetRateLimits();
  await clearSync();
});
test.afterAll(async () => {
  await clearSync();
});

/** Conecta e escolhe a conta pela tela (sem depender do estado anterior). */
async function connect(page: Page) {
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

const tasks = async (request: APIRequestContext) => {
  const res = await request.post("/api/internal/tarefas", {
    headers: { "x-tarefa-secret": process.env.CRON_SECRET! },
  });
  expect(res.status()).toBe(200);
  return res.json() as Promise<{ anuncios: string }>;
};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
}

test.describe("Gestor de Tráfego IA: sincronização", () => {
  test("atualizar agora traz campanhas, conjuntos, anúncios e resultados; repetir não duplica", async ({
    page,
  }) => {
    await staffLogin(page, "marketing@prosed.test");
    await connect(page);
    await page.getByRole("link", { name: "Campanhas", exact: true }).click();
    await expect(page.getByTestId("ultima-atualizacao")).toContainText("90 dias");
    await expect(page.getByRole("note")).toContainText("DEMO");

    await page.getByRole("button", { name: "Atualizar agora" }).click();
    await expect(
      page.getByText(/Atualizado: 3 campanha\(s\), 6 conjunto\(s\) e 12 anúncio\(s\)\./),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("ultima-atualizacao")).toContainText("Última atualização completa");

    const count = async () => ({
      campanhas: await prisma.metaCampaign.count({ where: { accountId: ACCOUNT } }),
      conjuntos: await prisma.metaAdSet.count({ where: { accountId: ACCOUNT } }),
      anuncios: await prisma.metaAd.count({ where: { accountId: ACCOUNT } }),
      criativos: await prisma.metaCreative.count({ where: { accountId: ACCOUNT } }),
      resultados: await prisma.metaInsightDaily.count({ where: { accountId: ACCOUNT } }),
    });
    const first = await count();
    expect(first).toMatchObject({ campanhas: 3, conjuntos: 6, anuncios: 12, criativos: 12 });
    expect(first.resultados).toBeGreaterThan(500);
    expect(await prisma.metaInsightDaily.count({ where: { accountId: ACCOUNT, isDemo: false } })).toBe(0);

    // Situações e totais da tela batem com o banco (30 dias, nível campanha).
    await expect(page.getByTestId(`campanha-${VENDAS}`)).toContainText("Ativa");
    await expect(page.getByTestId("campanha-2380000000000002")).toContainText("Pausada");
    await expect(page.getByTestId("campanha-2380000000000003")).toContainText("Encerrada");
    const since = new Date(Date.now() - 29 * 86_400_000).toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    });
    const sum = await prisma.metaInsightDaily.aggregate({
      where: { accountId: ACCOUNT, level: "CAMPANHA", date: { gte: new Date(`${since}T00:00:00Z`) } },
      _sum: { spend: true, purchases: true },
    });
    await expect(page.getByTestId("total-gasto")).toHaveAttribute("data-valor", String(sum._sum.spend));
    await expect(page.getByTestId("total-compras")).toHaveAttribute("data-valor", String(sum._sum.purchases));
    // Soma dos anúncios = soma das campanhas (nada contado duas vezes).
    const ads = await prisma.metaInsightDaily.aggregate({
      where: { accountId: ACCOUNT, level: "ANUNCIO", date: { gte: new Date(`${since}T00:00:00Z`) } },
      _sum: { spend: true },
    });
    expect(ads._sum.spend).toBe(sum._sum.spend);

    // Conjuntos e anúncios dentro da campanha.
    const vendas = page.getByTestId(`campanha-${VENDAS}`);
    await vendas.getByText("Conjuntos e anúncios").click();
    await expect(vendas.getByText("DEMO Vídeo depoimento").first()).toBeVisible();
    await axe(page);

    // Filtro de situação.
    await page.getByLabel("Situação").selectOption("pausada");
    await page.getByRole("button", { name: "Ver" }).click();
    await expect(page.getByTestId(`campanha-${VENDAS}`)).toHaveCount(0);
    await expect(page.getByTestId("campanha-2380000000000002")).toBeVisible();

    // Repetir (últimos 7 dias) não duplica nada.
    await page.goto("/admin/trafego/campanhas");
    await page.getByRole("button", { name: "Atualizar agora" }).click();
    await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });
    expect(await count()).toEqual(first);
    const runs = await prisma.metaSyncRun.findMany({ orderBy: { startedAt: "asc" } });
    expect(runs.map((r) => r.status)).toEqual(["OK", "OK"]);
    expect((runs[1]!.until.getTime() - runs[1]!.since.getTime()) / 86_400_000).toBe(6);
    expect(
      await prisma.auditLog.count({ where: { entityId: runs[0]!.id, action: "traffic.sync_manual" } }),
    ).toBe(1);
  });

  test("automática no intervalo; falha da Meta não apaga nada e avisa", async ({ page, request }) => {
    await staffLogin(page, "superadmin@prosed.test");
    await connect(page);

    // Intervalo configurável e auditado.
    await page.goto("/admin/trafego/campanhas");
    await page.getByLabel("Atualização automática").selectOption("15");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Intervalo de atualização salvo.")).toBeVisible();

    // Primeira rotina: nunca rodou → atualiza; segunda logo em seguida: não é hora.
    expect((await tasks(request)).anuncios).toBe("atualizado");
    expect((await tasks(request)).anuncios).toBe("nao_era_hora");
    const before = await prisma.metaInsightDaily.count();
    expect(before).toBeGreaterThan(0);

    // Passou o intervalo e a Meta falha nos resultados: fica "Parcial", nada se perde.
    await prisma.metaSyncRun.updateMany({ data: { startedAt: new Date(Date.now() - 16 * 60_000) } });
    await prisma.setting.create({ data: { key: "simulado.meta.falhas", value: { metodos: ["insights"] } } });
    expect((await tasks(request)).anuncios).toBe("erro");
    const last = await prisma.metaSyncRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    expect(last).toMatchObject({ status: "PARCIAL", trigger: "AUTOMATICA" });
    expect(await prisma.metaInsightDaily.count()).toBe(before);
    expect((await tasks(request)).anuncios).toBe("nao_era_hora"); // não repete a cada 30 s

    // Chave inválida: avisa para reconectar e para de tentar sozinha.
    await prisma.setting.update({
      where: { key: "simulado.meta.falhas" },
      data: { value: { metodos: ["campaigns"], token: true } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Atualizar agora" }).click();
    await expect(page.getByText("Conecte de novo.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("alert").first()).toContainText("Conecte de novo");
    await prisma.metaSyncRun.updateMany({ data: { startedAt: new Date(Date.now() - 3_600_000) } });
    expect((await tasks(request)).anuncios).toBe("nao_era_hora");

    // Desligar a automática.
    await prisma.setting.deleteMany({ where: { key: "simulado.meta.falhas" } });
    await page.getByLabel("Atualização automática").selectOption("0");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Intervalo de atualização salvo.")).toBeVisible();
  });

  test("sem conta escolhida a tela orienta; quem não é do tráfego não acessa", async ({ page, browser }) => {
    await staffLogin(page, "superadmin@prosed.test");
    await prisma.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } });
    await prisma.metaConnection.updateMany({
      where: { status: "ATIVA" },
      data: { status: "DESCONECTADA", tokenEnc: null, disconnectedAt: new Date() },
    });
    await page.goto("/admin/trafego/campanhas");
    await expect(page.getByRole("link", { name: "Ir para Conexão" })).toBeVisible();
    await axe(page);

    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await staffLogin(p, "financeiro@prosed.test");
    await p.goto("/admin/trafego/campanhas");
    await expect(p).toHaveURL(/\/admin\/sem-permissao$/);
    await ctx.close();
  });
});
