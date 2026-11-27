import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Entrega 8.1 — Gestor de Tráfego IA: conexão com a Meta (provedor SIMULADO, contas DEMO).
 * Confere o fluxo de autorização, a proteção do "state", a chave cifrada, a escolha da conta,
 * a desconexão, a auditoria e quem pode usar.
 */
test.skip(process.env.META_PROVIDER !== "simulado", "Gestor de Tráfego: precisa de META_PROVIDER=simulado");

test.beforeEach(async () => {
  await resetRateLimits();
  // Começa sempre sem conexão ativa.
  await prisma.metaAdAccount.updateMany({ where: { selected: true }, data: { selected: false } });
  await prisma.metaConnection.updateMany({
    where: { status: "ATIVA" },
    data: { status: "DESCONECTADA", tokenEnc: null, disconnectedAt: new Date() },
  });
});

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
}

/** Clica em Conectar e para na tela de autorização simulada; devolve o endereço dela. */
async function openAuthorize(page: Page, label = "Conectar com a Meta") {
  await page.goto("/admin/trafego");
  await page.getByRole("button", { name: label }).click();
  await expect(page).toHaveURL(/\/dev\/meta-autorizar\?/);
  return page.url();
}

test.describe("Gestor de Tráfego IA: conexão com a Meta", () => {
  test("conecta, escolhe a conta, guarda a chave cifrada e registra na auditoria", async ({ page }) => {
    await staffLogin(page, "superadmin@trafficmanager.test");
    await page.goto("/admin/trafego");
    await expect(page.getByRole("heading", { name: "Gestor de Tráfego IA", level: 1 })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("DEMO");
    await expect(page.getByTestId("conexao-meta")).toContainText("Ainda não conectado");
    await axe(page);

    await openAuthorize(page);
    await axe(page);
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/trafego\?resultado=conectado$/);
    await expect(page.getByTestId("resultado-conexao")).toContainText("Conexão com a Meta concluída");
    await expect(page.getByTestId("conexao-meta")).toContainText("Conectado como DEMO Usuário Meta");

    // Duas contas: a ativa pode ser escolhida; a encerrada não.
    const ativa = page.getByTestId("conta-act_1000000000000001");
    const encerrada = page.getByTestId("conta-act_1000000000000002");
    await expect(encerrada).toContainText("Encerrada");
    await expect(encerrada.getByRole("button")).toHaveCount(0);
    await ativa.getByRole("button", { name: /Usar a conta/ }).click();
    await expect(ativa).toContainText("em uso");
    await axe(page);

    const conn = await prisma.metaConnection.findFirstOrThrow({
      where: { status: "ATIVA" },
      include: { accounts: true },
    });
    // Chave cifrada (nunca em texto aberto) e contas marcadas DEMO.
    expect(conn.tokenEnc).toMatch(/^v1\./);
    expect(conn.tokenEnc).not.toContain("sim_token");
    expect(conn.scopes).toEqual(expect.arrayContaining(["ads_read", "ads_management"]));
    expect(conn.accounts.every((a) => a.isDemo)).toBe(true);
    expect(conn.accounts.find((a) => a.selected)?.accountId).toBe("act_1000000000000001");
    for (const action of ["traffic.meta_connected", "traffic.account_selected"])
      expect(await prisma.auditLog.count({ where: { action, at: { gte: conn.connectedAt } } })).toBe(1);
    // Nenhum registro de auditoria guarda a chave.
    expect(await prisma.auditLog.count({ where: { after: { string_contains: "sim_token" } } })).toBe(0);

    // A chave nunca vai para a tela.
    expect(await page.content()).not.toContain("sim_token");

    // Reconectar renova a chave e mantém a conta escolhida; a conexão anterior é encerrada sem chave.
    await openAuthorize(page, "Conectar de novo (renovar a chave)");
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await expect(page).toHaveURL(/resultado=conectado$/);
    await expect(page.getByTestId("conta-act_1000000000000001")).toContainText("em uso");
    const old = await prisma.metaConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(old).toMatchObject({ status: "DESCONECTADA", tokenEnc: null });

    // Atualizar a lista de contas.
    await page.getByRole("button", { name: "Atualizar lista de contas" }).click();
    await expect(page.getByText("Lista atualizada: 2 conta(s).")).toBeVisible();

    // Desconectar exige confirmação; depois apaga a chave.
    await page.getByRole("button", { name: "Desconectar da Meta" }).click();
    await expect(page.getByText("Marque a confirmação para desconectar.")).toBeVisible();
    await page.getByLabel(/Confirmo: desconectar apaga a chave/).check();
    await page.getByRole("button", { name: "Desconectar da Meta" }).click();
    // A tela volta para "não conectado" (a Meta simulada confirma a retirada: sem aviso pendente).
    await expect(page.getByTestId("conexao-meta")).toContainText("Ainda não conectado");
    await expect(page.getByTestId("conexao-meta").getByRole("alert")).toHaveCount(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "traffic.meta_disconnected", at: { gte: conn.connectedAt } },
      }),
    ).toBe(1);
    expect(await prisma.metaConnection.count({ where: { status: "ATIVA" } })).toBe(0);
    expect(await prisma.metaAdAccount.count({ where: { selected: true } })).toBe(0);
  });

  test("cancelar, permissões incompletas e retorno falsificado não conectam nada", async ({ page }) => {
    await staffLogin(page, "superadmin@trafficmanager.test");
    const before = await prisma.metaConnection.count();

    await openAuthorize(page);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/resultado=cancelado$/);
    await expect(page.getByTestId("resultado-conexao")).toContainText("cancelada");

    await openAuthorize(page);
    await page.getByRole("button", { name: "Autorizar sem a permissão de gerenciar anúncios" }).click();
    await expect(page).toHaveURL(/resultado=permissoes$/);
    await expect(page.getByTestId("resultado-conexao")).toContainText("Faltou autorizar");

    // Alguém tenta "colar" um retorno com um state inventado (ataque de CSRF no login da Meta).
    await page.goto(
      "/api/v1/admin/trafego/meta/retorno?code=sim_code_completo_abcdefghijk&state=estado-inventado-123456",
    );
    await expect(page).toHaveURL(/resultado=invalido$/);

    // Reaproveitar um retorno já usado também não funciona (state de uso único).
    const authorize = await openAuthorize(page);
    const state = new URL(authorize).searchParams.get("state")!;
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await expect(page).toHaveURL(/resultado=conectado$/);
    const conns = await prisma.metaConnection.count();
    await page.goto(`/api/v1/admin/trafego/meta/retorno?code=sim_code_completo_abcdefghijk&state=${state}`);
    await expect(page).toHaveURL(/resultado=(invalido|expirou)$/);
    expect(await prisma.metaConnection.count()).toBe(conns);
    expect(conns).toBe(before + 1);

    // A página simulada só volta para o nosso endereço de retorno.
    const evil = await page.request.get(
      `/dev/meta-autorizar?state=${"a".repeat(30)}&redirect_uri=${encodeURIComponent("https://evil.example/x")}`,
    );
    expect(evil.status()).toBe(404);
  });

  test("perfil Marketing usa o módulo; quem não tem empresa não", async ({ page, browser }) => {
    await staffLogin(page, "marketing@trafficmanager.test");
    await page.goto("/admin/trafego");
    await expect(page.getByRole("button", { name: "Conectar com a Meta" })).toBeVisible();
    // Marketing não administra a equipe nem as empresas.
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/admin\/sem-permissao$/);
    await page.goto("/admin/empresas");
    await expect(page).toHaveURL(/\/admin\/sem-permissao$/);

    for (const email of ["semempresa@trafficmanager.test"]) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await staffLogin(p, email);
      await p.goto("/admin/trafego");
      await expect(p).toHaveURL(/\/admin\/sem-empresa$/);
      // O retorno da Meta também exige empresa e permissão.
      await p.goto("/api/v1/admin/trafego/meta/retorno?code=x&state=y");
      await expect(p).toHaveURL(/\/admin\/sem-empresa$/);
      await ctx.close();
    }
  });
});
