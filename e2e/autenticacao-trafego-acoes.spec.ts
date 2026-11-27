import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Entrega 8.6 — ações nos anúncios com aprovação (Meta SIMULADA, dados DEMO):
 * pausar na hora; reativar e aumentar orçamento só com aprovação de OUTRA pessoa e dentro do teto;
 * interruptor geral; item que mudou na Meta; falha da Meta; permissões; travas no banco; auditoria.
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Ações: precisa de META_PROVIDER=simulado");
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const C1 = "2380000000000001"; // DEMO Vendas — ativa, R$ 50/dia
const C2 = "2380000000000002"; // DEMO Cadastros — pausada, R$ 20/dia
const STATE = "simulado.meta.estado";
const FAIL = "simulado.meta.falhas";
const SETTINGS = "traffic.actions";

async function setSettings(v: { enabled: boolean; dailyCapCents: number | null; maxIncreasePct: number }) {
  await prisma.setting.upsert({
    where: { key: SETTINGS },
    create: { key: SETTINGS, value: v },
    update: { value: v },
  });
}
const simState = async () =>
  ((await prisma.setting.findUnique({ where: { key: STATE } }))?.value ?? {}) as Record<
    string,
    { status?: string; daily?: number }
  >;

async function ensureDemoAccountAndSync(page: Page) {
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

/** Abre a revisão já preenchida e confirma com um motivo. */
async function submit(page: Page, q: Record<string, string>, button: RegExp) {
  await page.goto(`/admin/trafego/acoes?${new URLSearchParams(q).toString()}`);
  await expect(page.getByTestId("previa")).toBeVisible();
  await page.getByLabel("Motivo").fill("Teste automático da entrega 8.6");
  await page.getByLabel(/^Confirmo/).check();
  await page.getByRole("button", { name: button }).click();
}

async function asSuperadmin(browser: Browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await staffLogin(p, "superadmin@prosed.test");
  return { ctx, p };
}

test.beforeAll(async () => {
  await prisma.setting.deleteMany({ where: { key: { in: [STATE, FAIL] } } });
  await prisma.trafficAction.deleteMany({ where: { accountId: ACCOUNT } });
  await setSettings({ enabled: true, dailyCapCents: 10000, maxIncreasePct: 30 });
});
test.beforeEach(async ({ page }) => {
  await resetRateLimits();
  await prisma.setting.deleteMany({ where: { key: FAIL } });
  await staffLogin(page, "marketing@prosed.test");
});
test.afterAll(async ({ browser }) => {
  // Volta a Meta simulada ao estado inicial, desliga as ações e sincroniza de novo.
  await prisma.setting.deleteMany({ where: { key: { in: [STATE, FAIL, SETTINGS] } } });
  await prisma.trafficAction.deleteMany({
    where: { accountId: ACCOUNT, status: { in: ["PENDENTE", "EXECUTANDO"] } },
  });
  const { ctx, p } = await asSuperadmin(browser);
  await p.goto("/admin/trafego/campanhas");
  await p.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(p.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });
  await ctx.close();
});

test.describe("Gestor de Tráfego IA: ações com aprovação", () => {
  test("interruptor desligado: nada é feito na Meta", async ({ page }) => {
    test.setTimeout(120_000);
    await ensureDemoAccountAndSync(page);
    await setSettings({ enabled: false, dailyCapCents: 10000, maxIncreasePct: 30 });
    await page.getByRole("link", { name: "Ações", exact: true }).click();
    await expect(page.getByTestId("acoes-ligadas")).toHaveText("Desligadas");
    await expect(page.getByTestId("gasto-ativo")).toHaveAttribute("data-valor", "5000");
    await submit(page, { alvo: C1, tipo: "PAUSAR" }, /Fazer agora na Meta/);
    await expect(page.getByRole("alert").first()).toContainText("desligadas");
    expect(await simState()).toEqual({});
    await setSettings({ enabled: true, dailyCapCents: 10000, maxIncreasePct: 30 });
  });

  test("pausar é feito na hora, com histórico e auditoria", async ({ page }) => {
    await submit(page, { alvo: C1, tipo: "PAUSAR" }, /Fazer agora na Meta/);
    await expect(page.getByRole("status").first()).toContainText("Feito na Meta: Pausar");
    expect((await simState())[C1]?.status).toBe("PAUSED");
    const row = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C1, kind: "PAUSAR" },
      orderBy: { requestedAt: "desc" },
    });
    expect(row).toMatchObject({
      status: "EXECUTADA",
      increasesSpend: false,
      totalBefore: 5000,
      totalAfter: 0,
      isDemo: true,
    });
    expect(
      await prisma.auditLog.count({ where: { action: "traffic.action_executed", entityId: row.id } }),
    ).toBe(1);
    const local = await prisma.metaCampaign.findUniqueOrThrow({
      where: { accountId_externalId: { accountId: ACCOUNT, externalId: C1 } },
    });
    expect(local.status).toBe("PAUSED");
    await page.goto("/admin/trafego/acoes");
    await expect(page.getByTestId(`acao-${row.id}`)).toContainText("Feita na Meta");
  });

  test("reativar vira pedido; só outra pessoa aprova; aí é feito", async ({ page, browser }) => {
    await submit(page, { alvo: C1, tipo: "REATIVAR" }, /Enviar para aprovação/);
    await expect(page.getByRole("status").first()).toContainText("Pedido enviado para aprovação");
    expect((await simState())[C1]?.status).toBe("PAUSED"); // nada mudou ainda
    const row = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C1, status: "PENDENTE" },
    });
    expect(
      await prisma.auditLog.count({ where: { action: "traffic.action_requested", entityId: row.id } }),
    ).toBe(1);

    // Uma ação aberta por item.
    await submit(page, { alvo: C1, tipo: "ORCAMENTO", valor: "40,00" }, /Fazer agora na Meta/);
    await expect(page.getByRole("alert").first()).toContainText("Já existe uma ação aberta");

    // Marketing não tem o botão de aprovar.
    await page.goto("/admin/trafego/acoes");
    await expect(page.getByTestId(`pedido-${row.id}`)).toContainText("Aguardando alguém com permissão");
    await expect(page.getByRole("button", { name: /Aprovar e fazer/ })).toHaveCount(0);

    const { ctx, p } = await asSuperadmin(browser);
    await p.goto("/admin/trafego/acoes");
    const card = p.getByTestId(`pedido-${row.id}`);
    await card.getByLabel(/^Confirmo a aprovação/).check();
    await card.getByRole("button", { name: /Aprovar e fazer/ }).click();
    await expect(p.getByRole("status").first()).toContainText("Feito na Meta: Reativar");
    await ctx.close();

    expect((await simState())[C1]?.status).toBe("ACTIVE");
    const done = await prisma.trafficAction.findUniqueOrThrow({ where: { id: row.id } });
    const sa = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@prosed.test" } });
    expect(done).toMatchObject({ status: "EXECUTADA", decidedById: sa.id });
    expect(
      await prisma.auditLog.count({ where: { action: "traffic.action_approved", entityId: row.id } }),
    ).toBe(1);
  });

  test("aumento: limite por vez e teto aparecem na revisão", async ({ page }) => {
    await page.goto(`/admin/trafego/acoes?alvo=${C1}&tipo=ORCAMENTO&valor=70,00`);
    await expect(page.getByTestId("previa").getByRole("alert")).toContainText("o máximo por vez é 30%");
    await page.goto(`/admin/trafego/acoes?alvo=${C1}&tipo=ORCAMENTO&valor=65,00`);
    await expect(page.getByTestId("precisa-aprovacao")).toBeVisible();
    await expect(page.getByTestId("previa-total")).toContainText("R$ 50,00 → R$ 65,00");
    await setSettings({ enabled: true, dailyCapCents: 6000, maxIncreasePct: 30 });
    await page.goto(`/admin/trafego/acoes?alvo=${C1}&tipo=ORCAMENTO&valor=65,00`);
    await expect(page.getByTestId("previa").getByRole("alert")).toContainText("Passaria do teto");
    await setSettings({ enabled: true, dailyCapCents: null, maxIncreasePct: 30 });
    await page.goto(`/admin/trafego/acoes?alvo=${C2}&tipo=REATIVAR`);
    await expect(page.getByTestId("previa").getByRole("alert")).toContainText("Ainda não há teto");
    // Reduzir continua possível sem teto.
    await page.goto(`/admin/trafego/acoes?alvo=${C1}&tipo=ORCAMENTO&valor=45,00`);
    await expect(page.getByRole("button", { name: /Fazer agora na Meta/ })).toBeVisible();
    await setSettings({ enabled: true, dailyCapCents: 10000, maxIncreasePct: 30 });
  });

  test("quem pede não aprova (tela e banco); recusar e cancelar não mudam nada", async ({
    page,
    browser,
  }) => {
    const { ctx, p } = await asSuperadmin(browser);
    await submit(p, { alvo: C1, tipo: "ORCAMENTO", valor: "60,00" }, /Enviar para aprovação/);
    await expect(p.getByRole("status").first()).toContainText("Pedido enviado");
    const own = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C1, status: "PENDENTE" },
    });
    await p.goto("/admin/trafego/acoes");
    await expect(p.getByTestId(`pedido-${own.id}`)).toContainText("Você fez este pedido");
    await expect(p.getByTestId(`pedido-${own.id}`).getByRole("button", { name: /Aprovar/ })).toHaveCount(0);
    // Trava no banco: aprovar o próprio pedido que aumenta o gasto é recusado.
    await expect(
      prisma.trafficAction.update({
        where: { id: own.id },
        data: { status: "EXECUTADA", decidedById: own.requestedById },
      }),
    ).rejects.toThrow();
    await p
      .getByTestId(`pedido-${own.id}`)
      .getByRole("button", { name: /Cancelar pedido/ })
      .click();
    await expect(p.getByRole("status").first()).toContainText("Pedido cancelado");

    // Marketing pede para reativar a campanha 2; o superadmin recusa.
    await submit(page, { alvo: C2, tipo: "REATIVAR" }, /Enviar para aprovação/);
    await expect(page.getByRole("status").first()).toContainText("Pedido enviado");
    const req = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C2, status: "PENDENTE" },
    });
    await p.goto("/admin/trafego/acoes");
    const card = p.getByTestId(`pedido-${req.id}`);
    await card.getByLabel("Observação").fill("Sem verba este mês");
    await card.getByRole("button", { name: /Recusar/ }).click();
    await expect(p.getByRole("status").first()).toContainText("Pedido recusado");
    await ctx.close();

    expect(await prisma.trafficAction.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({
      status: "RECUSADA",
      decisionNote: "Sem verba este mês",
    });
    const s = await simState();
    expect(s[C2]?.status).toBeUndefined();
    expect(s[C1]?.daily).toBeUndefined();
  });

  test("item mudou na Meta depois do pedido: a aprovação não faz nada", async ({ page, browser }) => {
    await submit(page, { alvo: C1, tipo: "ORCAMENTO", valor: "60,00" }, /Enviar para aprovação/);
    await expect(page.getByRole("status").first()).toContainText("Pedido enviado");
    const row = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C1, status: "PENDENTE" },
    });
    // Alguém mudou o orçamento direto na Meta.
    const st = await simState();
    await prisma.setting.update({
      where: { key: STATE },
      data: { value: { ...st, [C1]: { ...st[C1], daily: 5500 } } },
    });

    const { ctx, p } = await asSuperadmin(browser);
    await p.goto("/admin/trafego/acoes");
    const card = p.getByTestId(`pedido-${row.id}`);
    await card.getByLabel(/^Confirmo a aprovação/).check();
    await card.getByRole("button", { name: /Aprovar e fazer/ }).click();
    await expect(p.getByRole("alert").first()).toContainText("mudou na Meta");
    await ctx.close();
    expect((await simState())[C1]?.daily).toBe(5500);
    expect((await prisma.trafficAction.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("FALHOU");
  });

  test("falha da Meta: nada é mudado e fica no histórico", async ({ page }) => {
    await prisma.setting.create({ data: { key: FAIL, value: { metodos: ["write"] } } });
    await submit(page, { alvo: C1, tipo: "PAUSAR" }, /Fazer agora na Meta/);
    await expect(page.getByRole("alert").first()).toContainText("Nada foi mudado");
    expect((await simState())[C1]?.status).toBe("ACTIVE");
    const row = await prisma.trafficAction.findFirstOrThrow({
      where: { accountId: ACCOUNT, objectId: C1 },
      orderBy: { requestedAt: "desc" },
    });
    expect(row.status).toBe("FALHOU");
    expect(
      await prisma.auditLog.count({ where: { action: "traffic.action_failed", entityId: row.id } }),
    ).toBe(1);
  });

  test("permissões: marketing não muda o teto; financeiro não abre", async ({ page, browser }) => {
    await page.goto("/admin/trafego/acoes");
    await expect(page.getByText("Só quem pode aprovar ações altera o teto")).toBeVisible();
    await expect(page.getByText("Alterar teto e regras")).toHaveCount(0);

    const { ctx, p } = await asSuperadmin(browser);
    await p.goto("/admin/trafego/acoes");
    await p.getByText("Alterar teto e regras").click();
    await p.getByLabel("Teto do gasto diário (R$)").fill("120,00");
    await p.getByRole("button", { name: "Salvar teto e regras" }).click();
    await expect(p.getByRole("status").first()).toContainText("Teto e regras salvos");
    await p.reload();
    await expect(p.getByTestId("teto")).toHaveText("R$ 120,00");
    expect(await prisma.auditLog.count({ where: { action: "traffic.actions_settings" } })).toBeGreaterThan(0);
    await ctx.close();

    const ctx2 = await browser.newContext();
    const f = await ctx2.newPage();
    await staffLogin(f, "financeiro@prosed.test");
    await f.goto("/admin/trafego/acoes");
    await expect(f).toHaveURL(/\/admin\/sem-permissao$/);
    await ctx2.close();
  });
});
