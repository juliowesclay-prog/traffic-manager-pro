import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { createTestApiKey, DEMO_COMPANY_A, prisma, resetRateLimits, sendEvents, staffLogin } from "./helpers";

/**
 * API de Conversões (Meta SIMULADA, dados DEMO): a fonte de vendas informa cadastro (com o link do
 * anúncio) e venda → eventos CompleteRegistration e Purchase enviados com o mínimo (fbc + identificador
 * com hash), sem o código do cliente; sem repetição; falha com nova tentativa; sem fbclid não vai.
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Conversões: precisa de META_PROVIDER=simulado");
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const CAMPAIGN = "2380000000000001";
const FBCLID = "IwAR0teste_E2E_capi_clique456";
const ORIGIN = `https://loja.demo/assinar?utm_source=facebook&utm_medium=paid&utm_campaign=${CAMPAIGN}&fbclid=${FBCLID}`;
const SIM = "simulado.meta.conversoes";
const FAIL = "simulado.meta.falhas";
const CAPI = `${DEMO_COMPANY_A}:traffic.capi`;

type SimEvent = {
  event_name: string;
  event_id: string;
  user_data: { fbc: string; external_id: string[] };
  custom_data?: { value: number; currency: string };
  _dataset: string;
  _teste: string | null;
};
const received = async () =>
  (((await prisma.setting.findUnique({ where: { key: SIM } }))?.value as { eventos?: SimEvent[] } | null)
    ?.eventos ?? []) as SimEvent[];

let lead: { id: string; externalId: string };
let key: string;

async function demoAccount(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await staffLogin(page, "superadmin@trafficmanager.test");
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
  return { ctx, page };
}

/** O sistema de vendas avisa o cadastro (com o link do anúncio) e a 1ª venda. */
async function signupAndPay(request: APIRequestContext) {
  const client = `cliente-${randomBytes(4).toString("hex")}`;
  const r = await sendEvents(request, key, {
    eventos: [
      { tipo: "cadastro", id: client, origem: ORIGIN },
      { tipo: "venda", id: `pedido-${client}`, cliente: client, valor: 39.9 },
    ],
  });
  expect(r.json.itens?.map((i) => i.status)).toEqual(["gravado", "gravado"]);
  const l = await prisma.lead.findFirstOrThrow({ where: { externalId: client } });
  return { id: l.id, externalId: client };
}

test.beforeAll(async () => {
  key = await createTestApiKey();
  await prisma.setting.deleteMany({ where: { key: { in: [SIM, FAIL, CAPI] } } });
  await prisma.metaConversionEvent.deleteMany({});
});
test.beforeEach(async () => {
  await resetRateLimits();
  await prisma.setting.deleteMany({ where: { key: FAIL } });
});
test.afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: { in: [FAIL, CAPI] } } });
});

test.describe("Gestor de Tráfego IA: API de Conversões", () => {
  test("desligada: nada entra na fila nem é enviado", async ({ request, browser }) => {
    test.setTimeout(180_000);
    const staff = await demoAccount(browser);
    lead = await signupAndPay(request);
    await staff.page.goto("/admin/trafego/conversoes");
    await expect(staff.page.getByTestId("capi-situacao")).toHaveText("Desligado");
    await staff.page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(staff.page.getByRole("alert").first()).toContainText("desligada");
    expect(await prisma.metaConversionEvent.count()).toBe(0);
    await staff.ctx.close();
  });

  test("ligada em modo de teste: cadastro e venda vão com o mínimo e sem dados pessoais", async ({
    browser,
  }) => {
    const { ctx, page } = await demoAccount(browser);
    await page.goto("/admin/trafego/conversoes");
    await page.getByText("Alterar configuração").click();
    await page.getByLabel("ID do conjunto de dados (pixel)").fill("abc");
    await page.getByLabel("Enviar cadastros e vendas para a Meta").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("alert").first()).toContainText("inválido");
    await page.getByLabel("ID do conjunto de dados (pixel)").fill("1234567890123456");
    await page.getByLabel("Código de teste").fill("TEST12345");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("status").first()).toContainText("ligada");
    expect(await prisma.auditLog.count({ where: { action: "traffic.capi_settings" } })).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId("capi-teste")).toContainText("TEST12345");
    await page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(page.getByRole("status").first()).toContainText(/ [1-9]\d* enviado\(s\)/);

    const rows = await prisma.metaConversionEvent.findMany({ where: { leadId: lead.id } });
    expect(rows.map((r) => r.kind).sort()).toEqual(["CADASTRO", "VENDA"]);
    expect(rows.every((r) => r.status === "ENVIADO" && r.testMode && r.isDemo)).toBe(true);
    expect(rows.find((r) => r.kind === "VENDA")?.valueCents).toBe(3990);

    const mine = (await received()).filter((e) => rows.some((r) => r.id === e.event_id));
    expect(mine.map((e) => e.event_name).sort()).toEqual(["CompleteRegistration", "Purchase"]);
    for (const e of mine) {
      expect(e.user_data.fbc).toMatch(new RegExp(`^fb\\.1\\.\\d+\\.${FBCLID}$`));
      expect(e.user_data.external_id[0]).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(e.user_data).sort()).toEqual(["external_id", "fbc"]);
      expect(e._dataset).toBe("1234567890123456");
      expect(e._teste).toBe("TEST12345");
    }
    expect(mine.find((e) => e.event_name === "Purchase")?.custom_data).toEqual({
      currency: "BRL",
      value: 39.9,
    });
    // Nem o código do cliente no sistema de vendas nem o ID interno vão para a Meta.
    const raw = JSON.stringify(mine);
    for (const s of [lead.externalId, lead.id]) expect(raw).not.toContain(s);

    // Enviar de novo não repete.
    const before = (await received()).length;
    await page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(page.getByRole("status").first()).toContainText("0 enviado(s)");
    expect(await prisma.metaConversionEvent.count({ where: { leadId: lead.id } })).toBe(2);
    expect((await received()).length).toBe(before);
    await expect(page.getByTestId("capi-eventos")).toContainText("Venda (1ª compra paga) · R$ 39,90");
    await ctx.close();
  });

  test("falha da Meta: fica com erro e é enviado na nova tentativa", async ({ browser }) => {
    const ev = await prisma.metaConversionEvent.findFirstOrThrow({
      where: { leadId: lead.id, kind: "VENDA" },
    });
    await prisma.metaConversionEvent.update({
      where: { id: ev.id },
      data: { status: "PENDENTE", attempts: 0, nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await prisma.setting.create({ data: { key: FAIL, value: { metodos: ["events"] } } });
    const { ctx, page } = await demoAccount(browser);
    await page.goto("/admin/trafego/conversoes");
    await page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(page.getByRole("alert").first()).toContainText("com erro");
    const failed = await prisma.metaConversionEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(failed).toMatchObject({ status: "ERRO", attempts: 1 });
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // A Meta volta; chegou a hora da nova tentativa.
    await prisma.setting.deleteMany({ where: { key: FAIL } });
    await prisma.metaConversionEvent.update({
      where: { id: ev.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(page.getByRole("status").first()).toContainText("1 enviado(s)");
    expect(await prisma.metaConversionEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({
      status: "ENVIADO",
      attempts: 2,
    });
    await ctx.close();
  });

  test("sem o código do clique (apagado) o evento não é enviado", async ({ browser }) => {
    const ev = await prisma.metaConversionEvent.findFirstOrThrow({
      where: { leadId: lead.id, kind: "CADASTRO" },
    });
    await prisma.metaConversionEvent.update({
      where: { id: ev.id },
      data: { status: "PENDENTE", nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { fbclid: null } });
    const before = (await received()).length;
    const { ctx, page } = await demoAccount(browser);
    await page.goto("/admin/trafego/conversoes");
    await page.getByRole("button", { name: "Enviar agora" }).click();
    await expect(page.getByRole("status").first()).toContainText("1 não enviado(s)");
    expect(await prisma.metaConversionEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({
      status: "DESCARTADO",
    });
    expect((await received()).length).toBe(before);
    await ctx.close();
  });

  test("permissões: marketing não altera a configuração; sem empresa não abre", async ({ page, browser }) => {
    await staffLogin(page, "marketing@trafficmanager.test");
    await page.goto("/admin/trafego/conversoes");
    await expect(page.getByText("Só quem pode aprovar ações altera esta configuração")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar agora" })).toBeVisible();
    const ctx = await browser.newContext();
    const f = await ctx.newPage();
    await staffLogin(f, "semempresa@trafficmanager.test");
    await f.goto("/admin/trafego/conversoes");
    await expect(f).toHaveURL(/\/admin\/sem-empresa$/);
    await ctx.close();
  });
});
