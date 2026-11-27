import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createTestApiKey, prisma, resetRateLimits, sendEvents, staffLogin } from "./helpers";

/**
 * Vendas por anúncio: a fonte de vendas (API) informa o cadastro com o endereço de entrada
 * (utm/fbclid) e a venda; ela aparece na campanha e no anúncio certos (Meta SIMULADA, dados DEMO).
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Gestor de Tráfego: precisa de META_PROVIDER=simulado");
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const CAMPAIGN = "2380000000000001";
const ADSET = "2381000000000000";
const AD = "238200000000000";
const FBCLID = "IwAR0teste_E2E_clique123";
const ORIGIN = `https://loja.demo/assinar?utm_source=facebook&utm_medium=paid&utm_campaign=${CAMPAIGN}&utm_term=${ADSET}&utm_content=${AD}&fbclid=${FBCLID}`;
const uid = (p: string) => `${p}-${randomBytes(4).toString("hex")}`;

let key: string;
test.beforeAll(async () => {
  key = await createTestApiKey();
});
test.beforeEach(async () => {
  await resetRateLimits();
});

async function staffWithDemoAccount(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await staffLogin(page, "marketing@trafficmanager.test");
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
  await page.goto("/admin/trafego/campanhas");
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });
  return { ctx, page };
}

async function rowValues(page: Page, testId: string) {
  const row = page.getByTestId(testId);
  if (!(await row.count())) return { spend: 0, signups: 0, sales: 0, revenue: 0 };
  const v = (i: number) => row.locator("td").nth(i).getAttribute("data-valor").then(Number);
  return { spend: await v(0), signups: await v(1), sales: await v(2), revenue: await v(3) };
}

test.describe("Gestor de Tráfego IA: vendas por anúncio (fonte de vendas)", () => {
  test("cadastro com link do anúncio → venda → estorno: números da campanha e do anúncio", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const staff = await staffWithDemoAccount(browser);
    await staff.page.goto("/admin/trafego/vendas");
    await expect(staff.page.getByTestId("parametros-url")).toContainText("utm_content={{ad.id}}");
    const before = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    const beforeAd = await rowValues(staff.page, `linha-anuncio-${AD}`);
    expect(before.spend).toBeGreaterThan(0); // a campanha tem investimento sincronizado

    // 1) O sistema de vendas avisa o cadastro com o endereço de entrada.
    const client = uid("cliente");
    const r1 = await sendEvents(request, key, { tipo: "cadastro", id: client, origem: ORIGIN });
    expect(r1.status).toBe(200);
    expect(r1.json.itens?.[0].status).toBe("gravado");
    const lead = await prisma.lead.findFirstOrThrow({ where: { externalId: client } });
    expect(lead).toMatchObject({
      source: "facebook",
      medium: "paid",
      campaignExternalId: CAMPAIGN,
      adSetExternalId: ADSET,
      adExternalId: AD,
      fbclid: FBCLID,
      landingUrl: "https://loja.demo/assinar",
      isDemo: true,
    });

    await staff.page.reload();
    const afterSignup = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    expect(afterSignup.signups - before.signups).toBe(1);
    expect(afterSignup.sales - before.sales).toBe(0);

    // 2) Venda paga.
    const order = uid("pedido");
    const r2 = await sendEvents(request, key, { tipo: "venda", id: order, cliente: client, valor: 39.9 });
    expect(r2.json.itens?.[0].status).toBe("gravado");
    await staff.page.reload();
    const after = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    expect(after.sales - before.sales).toBe(1);
    expect(after.revenue - before.revenue).toBe(3990);
    const afterAd = await rowValues(staff.page, `linha-anuncio-${AD}`);
    expect(afterAd.sales - beforeAd.sales).toBe(1);
    await expect(staff.page.getByTestId(`cac-c:${CAMPAIGN}`)).not.toHaveText("—");

    // 3) Estorno: a receita é descontada.
    const r3 = await sendEvents(request, key, { tipo: "estorno", id: order });
    expect(r3.json.itens?.[0].status).toBe("gravado");
    await staff.page.reload();
    const refunded = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    expect(refunded.revenue - before.revenue).toBe(0);
    await staff.ctx.close();
  });

  test("cadastro sem link marcado fica sem origem", async ({ request }) => {
    const client = uid("direto");
    await sendEvents(request, key, { tipo: "cadastro", id: client, origem: "https://loja.demo/" });
    const lead = await prisma.lead.findFirstOrThrow({ where: { externalId: client } });
    expect(lead).toMatchObject({ source: null, campaignExternalId: null, fbclid: null });
  });

  test("rotina apaga o código do clique (fbclid) depois de 90 dias", async ({ request }) => {
    const client = uid("antigo");
    await sendEvents(request, key, { tipo: "cadastro", id: client, origem: ORIGIN });
    await prisma.lead.updateMany({
      where: { externalId: client },
      data: { createdAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    const res = await request.post("/api/internal/tarefas", {
      headers: { "x-tarefa-secret": process.env.CRON_SECRET! },
    });
    expect(res.status()).toBe(200);
    const after = await prisma.lead.findFirstOrThrow({ where: { externalId: client } });
    expect(after.fbclid).toBeNull();
    expect(after.campaignExternalId).toBe(CAMPAIGN); // o resto continua
  });
});
