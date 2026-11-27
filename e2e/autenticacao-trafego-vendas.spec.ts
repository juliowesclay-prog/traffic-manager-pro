import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createPublishedPlan,
  lastCodeFor,
  prisma,
  randomCpf,
  randomPhone,
  resetRateLimits,
  staffLogin,
} from "./helpers";

/**
 * Entrega 8.3 — vendas por anúncio: o clique no anúncio (utm/fbclid) fica ligado ao cadastro e a
 * venda paga aparece na campanha e no anúncio certos (Meta SIMULADA, dados DEMO). Testes em série.
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Gestor de Tráfego: precisa de META_PROVIDER=simulado");

const ACCOUNT = "act_1000000000000001";
const CAMPAIGN = "2380000000000001";
const ADSET = "2381000000000000";
const AD = "238200000000000";
const AD_LINK = `/planos?utm_source=facebook&utm_medium=paid&utm_campaign=${CAMPAIGN}&utm_term=${ADSET}&utm_content=${AD}&fbclid=IwAR0teste_E2E_clique123`;

/** Sufixo só com letras (o cadastro recusa nome com números). */
const letters = () =>
  Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

test.beforeEach(async () => {
  await resetRateLimits();
});

async function staffWithDemoAccount(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await staffLogin(page, "marketing@prosed.test");
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

const num = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).locator("td").nth(2).getAttribute("data-valor")) ?? 0);
async function rowValues(page: Page, key: string) {
  const row = page.getByTestId(key);
  if (!(await row.count())) return { spend: 0, signups: 0, sales: 0, revenue: 0 };
  const v = (i: number) => row.locator("td").nth(i).getAttribute("data-valor").then(Number);
  return { spend: await v(0), signups: await v(1), sales: await v(2), revenue: await v(3) };
}

async function signup(page: Page, name: string) {
  const cpf = randomCpf();
  const phone = randomPhone();
  await page.goto("/associar");
  await page.locator("form[data-pronto]").waitFor();
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("Data de nascimento").fill("10031970");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Celular com DDD").fill(phone);
  await page.getByLabel("Estado").selectOption({ label: "Paraná" });
  await page.getByLabel("Cidade").selectOption({ label: "Londrina" });
  const sentAt = new Date();
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código recebido no celular").fill(await lastCodeFor(phone, sentAt));
  await page.getByLabel(/Li a Política de privacidade/).check();
  await page.getByRole("button", { name: "Concluir cadastro" }).click();
  await expect(page).toHaveURL(/\/app/);
  return prisma.member.findFirstOrThrow({
    where: { fullName: name, cpfLast2: cpf.slice(-2) },
    include: { attribution: true },
    orderBy: { createdAt: "desc" },
  });
}

test.describe("Gestor de Tráfego IA: vendas por anúncio", () => {
  test("clique no anúncio → cadastro → pagamento: a venda cai na campanha e no anúncio certos", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const staff = await staffWithDemoAccount(browser);
    await staff.page.goto("/admin/trafego/vendas");
    await expect(staff.page.getByTestId("parametros-url")).toContainText("utm_content={{ad.id}}");
    const before = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    const beforeAd = await rowValues(staff.page, `linha-anuncio-${AD}`);
    expect(before.spend).toBeGreaterThan(0); // a campanha tem investimento sincronizado

    // 1) Visitante chega pelo link do anúncio e se cadastra.
    await page.goto(AD_LINK);
    const cookie = (await page.context().cookies()).find((c) => c.name === "prosed_origem");
    expect(cookie?.httpOnly).toBe(true);
    const name = `Rita Anúncio ${letters()}`;
    const member = await signup(page, name);
    expect(member.attribution).toMatchObject({
      source: "facebook",
      medium: "paid",
      campaignExternalId: CAMPAIGN,
      adSetExternalId: ADSET,
      adExternalId: AD,
      fbclid: "IwAR0teste_E2E_clique123",
      landingPath: "/planos",
    });
    // O cookie de origem é apagado depois do cadastro.
    expect((await page.context().cookies()).find((c) => c.name === "prosed_origem")).toBeUndefined();
    await prisma.member.update({ where: { id: member.id }, data: { isDemo: true } });

    // 2) Cadastro aparece na campanha; ainda sem venda.
    await staff.page.reload();
    const afterSignup = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    expect(afterSignup.signups - before.signups).toBe(1);
    expect(afterSignup.sales - before.sales).toBe(0);

    // 3) Assina e paga (gateway simulado).
    const plan = await createPublishedPlan(3990);
    await page.goto(`/app/assinatura/contratar?plano=${plan.id}`);
    await page.getByLabel(/Li e aceito o Termo de Adesão/).check();
    await page.getByRole("button", { name: "ACEITAR E CONTINUAR" }).click();
    await page.getByRole("button", { name: "IR PARA O PAGAMENTO" }).click();
    await page.getByRole("button", { name: "Aprovar pagamento" }).click();
    await expect
      .poll(async () => (await prisma.subscription.findFirst({ where: { memberId: member.id } }))?.status, {
        timeout: 15_000,
      })
      .toBe("ATIVA");

    // 4) A venda e a receita aparecem na campanha e no anúncio; CAC calculado.
    await staff.page.reload();
    const after = await rowValues(staff.page, `linha-c:${CAMPAIGN}`);
    expect(after.sales - before.sales).toBe(1);
    expect(after.revenue - before.revenue).toBe(3990);
    const afterAd = await rowValues(staff.page, `linha-anuncio-${AD}`);
    expect(afterAd.sales - beforeAd.sales).toBe(1);
    await expect(staff.page.getByTestId(`cac-c:${CAMPAIGN}`)).not.toHaveText("—");

    // 5) O associado vê a origem nos próprios dados (LGPD).
    const data = (await (await page.request.get("/api/v1/me/dados")).json()) as {
      origem_do_cadastro: { campanha: string; codigo_do_clique_meta_guardado: boolean } | null;
    };
    expect(data.origem_do_cadastro).toMatchObject({
      campanha: CAMPAIGN,
      codigo_do_clique_meta_guardado: true,
    });
    await staff.ctx.close();
  });

  test("sem link marcado não há origem; cookie adulterado é ignorado", async ({ browser }) => {
    const organic = await browser.newContext();
    const p1 = await organic.newPage();
    const m1 = await signup(p1, `Paulo Direto ${letters()}`);
    expect(m1.attribution).toBeNull();
    await prisma.member.update({ where: { id: m1.id }, data: { isDemo: true } });
    await organic.close();

    const forged = await browser.newContext();
    await forged.addCookies([
      {
        name: "prosed_origem",
        value: `utm_source=facebook&utm_campaign=1234567&t=${Date.now() + 86_400_000}`, // "do futuro"
        domain: "localhost",
        path: "/",
      },
    ]);
    const p2 = await forged.newPage();
    const m2 = await signup(p2, `Lia Cookie ${letters()}`);
    expect(m2.attribution).toBeNull();
    await prisma.member.update({ where: { id: m2.id }, data: { isDemo: true } });
    await forged.close();
  });

  test("rotina apaga o código do clique (fbclid) depois de 90 dias", async ({ request }) => {
    const m = await prisma.member.findFirstOrThrow({
      where: { attribution: { fbclid: { not: null } } },
      include: { attribution: true },
    });
    await prisma.memberAttribution.update({
      where: { memberId: m.id },
      data: { clickedAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    const res = await request.post("/api/internal/tarefas", {
      headers: { "x-tarefa-secret": process.env.CRON_SECRET! },
    });
    expect(res.status()).toBe(200);
    const after = await prisma.memberAttribution.findUniqueOrThrow({ where: { memberId: m.id } });
    expect(after.fbclid).toBeNull();
    expect(after.campaignExternalId).toBe(m.attribution!.campaignExternalId); // o resto continua
  });
});
