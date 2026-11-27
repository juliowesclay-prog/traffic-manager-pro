import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createTestApiKey,
  DEMO_COMPANY_A,
  DEMO_COMPANY_B,
  prisma,
  resetRateLimits,
  sendEvents,
  staffLogin,
} from "./helpers";

/**
 * Empresas separadas: cada empresa só vê os próprios dados; o seletor troca a empresa aberta;
 * a chave da API é gerada pela tela e mostrada uma vez; a API recusa chave errada, revogada ou de
 * empresa suspensa e não duplica o mesmo evento. Dados DEMO.
 */
test.describe.configure({ mode: "serial" });
const uid = (p: string) => `${p}-${randomBytes(4).toString("hex")}`;

test.beforeEach(async () => {
  await resetRateLimits();
  await prisma.company.updateMany({ where: { id: { in: [DEMO_COMPANY_A, DEMO_COMPANY_B] } }, data: { status: "ATIVA" } });
});

test.describe("Empresas e fonte de vendas", () => {
  test("API: chave obrigatória, erros por item e sem duplicar", async ({ request }) => {
    const key = await createTestApiKey(DEMO_COMPANY_A);
    const noKey = await request.post("/api/v1/eventos", { data: { tipo: "cadastro", id: "x" } });
    expect(noKey.status()).toBe(401);
    const wrong = await sendEvents(request, `${key.slice(0, -4)}AAAA`, { tipo: "cadastro", id: "x" });
    expect(wrong.status).toBe(401);
    const bad = await request.post("/api/v1/eventos", {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      data: Buffer.from("{não é json"),
    });
    expect(bad.status()).toBe(400);

    const client = uid("cli");
    const r = await sendEvents(request, key, {
      eventos: [
        { tipo: "cadastro", id: client },
        { tipo: "cadastro", id: client },
        { tipo: "venda", id: uid("p"), cliente: "nao-existe", valor: 10 },
        { tipo: "pix", id: "y" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.json.itens?.map((i) => i.status)).toEqual(["gravado", "repetido", "erro", "erro"]);
    expect(await prisma.lead.count({ where: { externalId: client } })).toBe(1);
  });

  test("cada empresa grava e vê só os próprios dados", async ({ request }) => {
    const keyA = await createTestApiKey(DEMO_COMPANY_A);
    const keyB = await createTestApiKey(DEMO_COMPANY_B);
    const client = uid("mesmo-id");
    // O mesmo código de cliente em duas empresas são dois cadastros diferentes.
    expect((await sendEvents(request, keyA, { tipo: "cadastro", id: client })).json.itens?.[0].status).toBe("gravado");
    expect((await sendEvents(request, keyB, { tipo: "cadastro", id: client })).json.itens?.[0].status).toBe("gravado");
    const rows = await prisma.lead.findMany({ where: { externalId: client }, select: { companyId: true } });
    expect(rows.map((r) => r.companyId).sort()).toEqual([DEMO_COMPANY_A, DEMO_COMPANY_B]);
    // A chave da Empresa B não estorna venda da Empresa A.
    const order = uid("pedido");
    await sendEvents(request, keyA, { tipo: "venda", id: order, cliente: client, valor: 20 });
    const refund = await sendEvents(request, keyB, { tipo: "estorno", id: order });
    expect(refund.json.itens?.[0]).toMatchObject({ status: "erro" });
    expect((await prisma.sale.findFirstOrThrow({ where: { externalId: order } })).status).toBe("PAGA");
  });

  test("seletor: gestor troca de empresa; marketing só vê a própria", async ({ page, browser }) => {
    await staffLogin(page, "gestor@trafficmanager.test", DEMO_COMPANY_A);
    await page.goto("/admin/fonte-de-vendas");
    await expect(page.getByText(/sistemas de DEMO Empresa A envia/)).toBeVisible();
    await page.getByLabel("Empresa aberta").selectOption({ label: "DEMO Empresa B" });
    await expect(page.getByText(/sistemas de DEMO Empresa B envia/)).toBeVisible();
    // A conexão com a Meta da Empresa A não aparece na Empresa B.
    if (await prisma.metaConnection.count({ where: { companyId: DEMO_COMPANY_A, status: "ATIVA" } })) {
      expect(await prisma.metaConnection.count({ where: { companyId: DEMO_COMPANY_B, status: "ATIVA" } })).toBe(0);
      await page.goto("/admin/trafego");
      await expect(page.getByRole("button", { name: "Conectar com a Meta" })).toBeVisible();
    }
    expect(await prisma.auditLog.count({ where: { action: "company.switched" } })).toBeGreaterThan(0);

    const ctx = await browser.newContext();
    const m = await ctx.newPage();
    await staffLogin(m, "marketing@trafficmanager.test");
    await m.goto("/admin/fonte-de-vendas");
    await expect(m.getByLabel("Empresa aberta").locator("option")).toHaveText(["DEMO Empresa A"]);
    // Sem permissão para cadastrar empresas.
    await m.goto("/admin/empresas");
    await expect(m).not.toHaveURL(/\/admin\/empresas$/);
    await ctx.close();
  });

  test("superadmin gera a chave pela tela (mostrada uma vez), revoga e suspende", async ({ page, request }) => {
    // Limite de 10 chaves ativas: revoga as chaves de teste antigas.
    await prisma.apiKey.updateMany({ where: { companyId: DEMO_COMPANY_B, revokedAt: null }, data: { revokedAt: new Date() } });
    await staffLogin(page, "superadmin@trafficmanager.test");
    await page.goto(`/admin/empresas/${DEMO_COMPANY_B}`);
    await page.getByLabel("Nome da integração (ex.: Site, Loja, CRM)").fill(`E2E ${uid("tela")}`);
    await page.getByRole("button", { name: "Gerar chave" }).click();
    const key = (await page.getByTestId("chave-api").textContent())!.trim();
    expect(key).toMatch(/^tmp_[0-9a-f]{8}_/);
    // Só o hash fica no banco.
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { prefix: key.slice(0, 12) } });
    expect(JSON.stringify(row)).not.toContain(key.slice(13));
    await page.reload();
    await expect(page.getByTestId("chave-api")).toHaveCount(0);

    expect((await sendEvents(request, key, { tipo: "cadastro", id: uid("ok") })).status).toBe(200);

    // Empresa suspensa: a API recusa.
    await prisma.company.update({ where: { id: DEMO_COMPANY_B }, data: { status: "SUSPENSA" } });
    expect((await sendEvents(request, key, { tipo: "cadastro", id: uid("s") })).status).toBe(401);
    await prisma.company.update({ where: { id: DEMO_COMPANY_B }, data: { status: "ATIVA" } });

    // Chave revogada: a API recusa.
    await page.getByTestId(`chave-${row.prefix}`).getByRole("button", { name: "Revogar" }).click();
    await expect.poll(async () => (await prisma.apiKey.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).not.toBeNull();
    expect((await sendEvents(request, key, { tipo: "cadastro", id: uid("r") })).status).toBe(401);
  });
});
