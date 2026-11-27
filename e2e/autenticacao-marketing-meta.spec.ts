import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEMO_COMPANY_A, prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Marketing IA — Etapas 5 a 7: Canva (simulado: conectar, listar, importar carrossel), Enviar para
 * Meta (simulada: anúncio SEMPRE pausado, alerta de política, criativo vira "Enviado para Meta") e
 * Desempenho (anúncio existente vinculado, ranking e comparação por tipo, período citado). Dados DEMO.
 */
test.skip(
  process.env.META_PROVIDER !== "simulado" || process.env.CANVA_PROVIDER !== "simulado",
  "precisa de META_PROVIDER=simulado e CANVA_PROVIDER=simulado",
);
test.describe.configure({ mode: "serial" });

const ACCOUNT = "act_1000000000000001";
const NAME = "DEMO Carrossel 3 páginas";
let creativeId = "";

async function cleanup() {
  const where = { companyId: DEMO_COMPANY_A, origin: "CANVA" as const };
  await prisma.metaAdSubmission.deleteMany({ where: { creative: where } });
  await prisma.creative.deleteMany({ where });
  await prisma.canvaConnection.deleteMany({ where: { companyId: DEMO_COMPANY_A } });
}

test.beforeAll(async () => {
  await cleanup();
  await resetRateLimits();
});
test.afterAll(cleanup);

test("Canva: conecta a conta, lista os designs e importa um carrossel para a biblioteca", async ({
  page,
}) => {
  await staffLogin(page, "gestor@trafficmanager.test");
  await page.goto("/admin/marketing/canva");
  await page.getByRole("button", { name: "Conectar minha conta do Canva" }).click();
  await expect(page.getByText("Canva conectado.")).toBeVisible();
  const card = page.getByTestId("canva-designs").locator("li", { hasText: NAME });
  await card.getByRole("button", { name: "Importar para a biblioteca" }).click();
  await expect(card.getByRole("link", { name: "Abrir na biblioteca" })).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link", { name: "Abrir na biblioteca" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/);
  creativeId = page.url().split("/").pop()!;
  const c = await prisma.creative.findUniqueOrThrow({
    where: { id: creativeId },
    include: { versions: { include: { assets: true } } },
  });
  expect(c).toMatchObject({ origin: "CANVA", kind: "CARROSSEL", status: "RASCUNHO" });
  expect(c.versions[0]!.assets).toHaveLength(3);
  // Sem aprovação, não há botão de envio.
  await expect(page.getByRole("link", { name: "Enviar para a Meta" })).toHaveCount(0);

  await page.getByLabel("Novo status").selectOption("AGUARDANDO_APROVACAO");
  await page.getByRole("button", { name: "Alterar status" }).click();
  await expect(page.getByTestId("status-criativo")).toHaveText("Aguardando aprovação");
  await page.getByLabel("Novo status").selectOption("APROVADO");
  await page.getByRole("button", { name: "Alterar status" }).click();
  await expect(page.getByTestId("status-criativo")).toHaveText("Aprovado");
});

test("Enviar para Meta: anúncio criado PAUSADO, com alerta de política e confirmação", async ({ page }) => {
  test.setTimeout(120_000);
  await staffLogin(page, "gestor@trafficmanager.test");
  await page.goto("/admin/trafego");
  const connect = page.getByRole("button", { name: "Conectar com a Meta" });
  if (await connect.isVisible()) {
    await connect.click();
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
  }
  const acc = page.getByTestId(`conta-${ACCOUNT}`);
  if (!(await acc.textContent())?.includes("em uso")) await acc.getByRole("button").click();
  await expect(acc).toContainText("em uso");
  await page.goto("/admin/trafego/campanhas");
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.getByText(/^Atualizado:/)).toBeVisible({ timeout: 60_000 });

  await page.goto(`/admin/marketing/biblioteca/${creativeId}`);
  await page.getByRole("link", { name: "Enviar para a Meta" }).click();
  await expect(page.getByTestId("enviar-criativo")).toContainText("PAUSADO");
  await expect(page.getByTestId("enviar-criativo")).toContainText("DEMO");
  const form = page.getByTestId("form-enviar-meta");
  const adSet = form.getByLabel("Conjunto de anúncios (campanha — conjunto)");
  const firstSet = await adSet.locator("option").nth(1).getAttribute("value");
  await adSet.selectOption(firstSet!);
  await expect(form.getByLabel("Página do Facebook")).toHaveValue("1090000000000001");
  await form.getByLabel("Texto principal").fill("Resultado garantido: cura em 7 dias com a nossa clínica.");
  await form.getByLabel("Título", { exact: true }).fill("Atendimento no mesmo dia");
  await form.getByLabel("Link de destino").fill("https://exemplo.com.br/demo");
  await expect(page.getByTestId("alerta-politica-envio")).toBeVisible();

  // Sem a confirmação, não envia.
  await form.getByRole("button", { name: "Criar anúncio pausado na Meta" }).click();
  await expect(form.getByText(/marque a confirmação/)).toBeVisible();
  await form.getByLabel("Texto principal").fill("Atendimento no mesmo dia. Agende pelo site.");
  await expect(page.getByTestId("alerta-politica-envio")).toHaveCount(0);
  await form.getByLabel(/Revisei o texto/).check();
  await form.getByRole("button", { name: "Criar anúncio pausado na Meta" }).click();
  await expect(page.getByTestId("envio-ok")).toContainText("PAUSADO", { timeout: 60_000 });

  const sub = await prisma.metaAdSubmission.findFirstOrThrow({ where: { creativeId } });
  expect(sub).toMatchObject({ status: "ENVIADO", adSetId: firstSet, isDemo: true });
  expect(sub.metaImageHashes).toHaveLength(3);
  const c = await prisma.creative.findUniqueOrThrow({ where: { id: creativeId } });
  expect(c.status).toBe("ENVIADO_META");
  expect(c.metaAdIds).toEqual([sub.metaAdId]);
  const log = await prisma.setting.findUniqueOrThrow({ where: { key: "simulado.meta.anuncios_criados" } });
  const itens = (log.value as { itens: Record<string, unknown>[] }).itens;
  const ad = itens.find((i) => i.id === sub.metaAdId)!;
  expect(ad).toMatchObject({ tipo: "anuncio", status: "PAUSED", adSetId: firstSet });
  const cr = itens.find((i) => i.id === sub.metaCreativeId) as {
    spec: { link_data: { child_attachments: unknown[] } };
  };
  expect(cr.spec.link_data.child_attachments).toHaveLength(3);

  // Histórico mostra o envio; criativo não pode ser enviado de novo.
  await page.goto("/admin/marketing/enviar-meta");
  await expect(page.getByTestId("historico-envios")).toContainText("Criado pausado");
  await page.goto(`/admin/marketing/enviar-meta?criativo=${creativeId}`);
  await expect(page.getByText(/não está aprovado na versão atual/)).toBeVisible();
});

test("Desempenho: vincula anúncio existente e mostra ranking e comparação por tipo", async ({ page }) => {
  await staffLogin(page, "gestor@trafficmanager.test");
  await page.goto(`/admin/marketing/biblioteca/${creativeId}`);
  const link = page.getByTestId("vincular-anuncio");
  const select = link.getByLabel("Anúncio já existente na Meta");
  await select.selectOption({ index: 1 });
  await link.getByRole("button", { name: "Vincular para medir o desempenho" }).click();
  await expect(link.getByText(/vinculado/)).toBeVisible();
  const c = await prisma.creative.findUniqueOrThrow({ where: { id: creativeId } });
  expect(c.metaAdIds).toHaveLength(2);

  await page.goto("/admin/marketing/desempenho?dias=30");
  await expect(page.getByTestId("periodo")).toContainText("Período:");
  await expect(page.getByRole("link", { name: "Últimos 30 dias" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("ranking-criativos")).toContainText(NAME);
  await expect(page.getByTestId("ranking-criativos")).toContainText("2 anúncio(s)");
  await expect(page.getByTestId("por-tipo")).toContainText("Carrossel");
  await expect(page.getByTestId("leitura-desempenho")).toContainText("Nos últimos 30 dias");

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
});
