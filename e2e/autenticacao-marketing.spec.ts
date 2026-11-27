import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { DEMO_COMPANY_A, DEMO_COMPANY_B, prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Marketing IA — Etapa 1: menu e seções, kit da marca (logomarca, informações oficiais com aprovação),
 * biblioteca (importar imagem, carrossel e vídeo reais, versões, status, aprovação, duplicar, excluir),
 * conferência dos arquivos pelo conteúdo e separação por empresa. Dados DEMO.
 */
test.describe.configure({ mode: "serial" });

const DIR = path.join("test-results", "marketing-arquivos");
const PREFIX = "DEMO E2E";

function png(name: string, w: number, h: number, rgb: [number, number, number]) {
  const img = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
  const file = path.join(DIR, name);
  writeFileSync(file, PNG.sync.write(img));
  return file;
}

let video: string | null = null;
const files: Record<string, string> = {};

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  files.feed = png("feed.png", 1080, 1080, [31, 79, 216]);
  files.p1 = png("pagina1.png", 1080, 1350, [200, 50, 60]);
  files.p2 = png("pagina2.png", 1080, 1350, [15, 138, 95]);
  files.p3 = png("pagina3.png", 1080, 1350, [18, 24, 38]);
  files.logo = png("logo.png", 400, 400, [255, 255, 255]);
  files.small = png("pequena.png", 100, 100, [0, 0, 0]);
  files.fake = path.join(DIR, "disfarcado.png");
  writeFileSync(files.fake, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
  try {
    video = path.join(DIR, "video.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=25", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "3", "-pix_fmt", "yuv420p", "-shortest", video],
      { stdio: "ignore" },
    );
  } catch {
    video = null;
  }
  await cleanup();
});

async function cleanup() {
  await prisma.creative.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { name: { startsWith: PREFIX } } });
}
test.afterAll(cleanup);

test.beforeEach(async () => {
  await resetRateLimits();
});

/** Troca de usuário na mesma janela (sai da sessão atual antes). */
async function switchUser(page: Page, email: string, company: string = DEMO_COMPANY_A) {
  await page.context().clearCookies();
  await staffLogin(page, email, company);
}

async function importCreative(page: Page, name: string, paths: string[]) {
  await page.goto("/admin/marketing/biblioteca");
  await page.getByText("Importar criativo").click();
  await page.getByLabel("Nome do criativo").fill(name);
  await page.getByLabel("Arquivos").setInputFiles(paths);
  await page.getByRole("button", { name: "Enviar para a biblioteca" }).click();
}

test("menu Marketing, seções e páginas das próximas etapas sem botões falsos", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/trafego/painel");
  await page.getByRole("navigation", { name: "Painel" }).first().getByRole("link", { name: "Marketing" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing$/);
  await expect(page.getByRole("heading", { name: "Marketing", level: 1 })).toBeVisible();
  for (const s of ["Estúdio IA", "Criar Artes", "Criar Carrossel", "Editor de Vídeos IA", "Biblioteca de Criativos", "Enviar para Meta", "Kit da marca"])
    await expect(page.getByRole("navigation", { name: "Seções do Marketing" }).getByRole("link", { name: s })).toBeVisible();

  await page.goto("/admin/marketing/videos");
  await expect(page.getByTestId("em-breve")).toContainText("Etapa 4");
  await page.goto("/admin/marketing/enviar-meta");
  await expect(page.getByTestId("em-breve")).toContainText("PAUSADO");

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
});

test("kit da marca: identidade, logomarca e informação oficial que só o Gestor aprova", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/marketing/marca");
  await page.getByLabel("Nome da marca").fill(`${PREFIX} Marca`);
  await page.getByRole("button", { name: "Criar marca" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/marca\/[0-9a-f-]{36}$/);

  await page.getByLabel("Site").fill("exemplo-demo.com.br");
  await page.getByLabel("Código da cor 1").fill("#0F8A5F");
  await page.getByLabel("Chamadas para ação preferidas").fill("Assine agora\nFale com a gente");
  await page.getByLabel("Instagram").fill("instagram.com/demo");
  await page.getByLabel("Fonte dos títulos").selectOption("Sora");
  await page.getByRole("button", { name: "Salvar kit da marca" }).click();
  await expect(page.getByText("Kit da marca salvo.")).toBeVisible();

  const brand = await prisma.brand.findFirstOrThrow({ where: { name: `${PREFIX} Marca` } });
  expect(brand).toMatchObject({ companyId: DEMO_COMPANY_A, website: "https://exemplo-demo.com.br/", colors: ["#0F8A5F"], ctas: ["Assine agora", "Fale com a gente"], headingFont: "Sora" });

  await page.getByLabel("Arquivo da logomarca").setInputFiles(files.logo!);
  await page.getByRole("button", { name: "Enviar logomarca" }).click();
  await expect(page.getByText("Logomarca atualizada.")).toBeVisible();
  await expect(page.getByRole("img", { name: `Logomarca de ${PREFIX} Marca` })).toBeVisible();

  await page.getByText("Cadastrar informação oficial").click();
  await page.getByLabel("Título", { exact: true }).fill("Benefício DEMO de teste");
  await page.getByRole("button", { name: "Cadastrar informação" }).click();
  await expect(page.getByText(/só será usada pela IA depois de aprovada/)).toBeVisible();
  const fact = await prisma.brandFact.findFirstOrThrow({ where: { brandId: brand.id } });
  const factCard = page.getByTestId(`fato-${fact.id}`);
  await expect(factCard).toContainText("Rascunho (a IA não usa)");
  await expect(factCard.getByRole("button", { name: "Aprovar" })).toHaveCount(0);

  await switchUser(page, "gestor@trafficmanager.test");
  await page.goto(`/admin/marketing/marca/${brand.id}`);
  await page.getByTestId(`fato-${fact.id}`).getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByTestId(`fato-${fact.id}`)).toContainText("Aprovada");
  expect(await prisma.brandFact.findUniqueOrThrow({ where: { id: fact.id } })).toMatchObject({ status: "APROVADO" });
});

test("biblioteca: imagem com versões, status, aprovação, duplicar e excluir", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await importCreative(page, `${PREFIX} Feed`, [files.feed!]);
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const id = page.url().split("/").pop()!;
  await expect(page.getByTestId("status-criativo")).toHaveText("Rascunho");
  await expect(page.getByTestId("previa")).toContainText("1:1 (feed quadrado)");

  // O arquivo final existe e é servido pelo servidor (com download).
  const c = await prisma.creative.findUniqueOrThrow({ where: { id }, include: { versions: { include: { assets: true } } } });
  const asset = c.versions[0]!.assets[0]!;
  expect(asset).toMatchObject({ status: "PRONTO", mimeType: "image/png", width: 1080, height: 1080 });
  const res = await page.request.get(`/api/v1/admin/marketing/arquivos/${asset.id}?baixar=1`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect((await res.body()).subarray(1, 4).toString()).toBe("PNG");

  // Marketing envia para aprovação, mas não aprova.
  await expect(page.getByLabel("Novo status").locator("option", { hasText: "Aprovado" })).toHaveCount(0);
  await page.getByLabel("Novo status").selectOption("AGUARDANDO_APROVACAO");
  await page.getByRole("button", { name: "Alterar status" }).click();
  await expect(page.getByTestId("status-criativo")).toHaveText("Aguardando aprovação");

  await switchUser(page, "gestor@trafficmanager.test");
  await page.goto(`/admin/marketing/biblioteca/${id}`);
  await page.getByLabel("Novo status").selectOption("APROVADO");
  await page.getByRole("button", { name: "Alterar status" }).click();
  await expect(page.getByTestId("status-criativo")).toHaveText("Aprovado");
  await expect(page.getByTestId("aprovacao")).toContainText("Versão 1");

  // Versão nova: o original fica guardado e o criativo volta para edição.
  await page.getByText("Enviar nova versão").click();
  await page.getByLabel("Arquivos da nova versão").setInputFiles(files.p1!);
  await page.getByLabel("O que mudou").fill("Formato vertical");
  await page.getByRole("button", { name: "Criar nova versão" }).click();
  await expect(page.getByText(/Versão 2 criada/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("status-criativo")).toHaveText("Em edição");
  await expect(page.getByTestId("versoes")).toContainText("Versão 1");
  await expect(page.getByTestId("versoes")).toContainText("Formato vertical");
  await expect(page.getByTestId("previa")).toContainText("4:5");

  // Duplicar e excluir (com confirmação).
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/marketing/biblioteca/(?!${id})[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${PREFIX} Feed (cópia)`);
  await page.getByText("Excluir criativo").click();
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page.getByText("Marque a confirmação para excluir.")).toBeVisible();
  await page.getByLabel(/Confirmo que quero excluir/).check();
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca$/);
  expect(await prisma.creative.count({ where: { name: `${PREFIX} Feed (cópia)` } })).toBe(0);

  // Pesquisa por nome e tipo.
  await page.goto(`/admin/marketing/biblioteca?q=${encodeURIComponent(`${PREFIX} Feed`)}&tipo=IMAGEM`);
  await expect(page.getByTestId(`criativo-${id}`)).toBeVisible();
  await page.goto(`/admin/marketing/biblioteca?q=${encodeURIComponent(`${PREFIX} Feed`)}&tipo=VIDEO`);
  await expect(page.getByTestId(`criativo-${id}`)).toHaveCount(0);
});

test("carrossel e vídeo reais entram com páginas, medidas e duração", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await importCreative(page, `${PREFIX} Carrossel`, [files.p1!, files.p2!, files.p3!]);
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Prévia da versão 1 \(3 páginas\)/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Página 3 de/ })).toBeVisible();

  test.skip(!video, "ffmpeg não instalado: teste do vídeo real pulado");
  await importCreative(page, `${PREFIX} Vídeo`, [video!]);
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByTestId("previa")).toContainText("9:16");
  await expect(page.getByTestId("previa")).toContainText("0:03");
  const v = await prisma.mediaAsset.findFirstOrThrow({
    where: { version: { creative: { name: `${PREFIX} Vídeo` } } },
  });
  expect(v).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4", width: 720, height: 1280 });
  // Trechos (Range) para o vídeo tocar e avançar no navegador.
  const part = await page.request.get(`/api/v1/admin/marketing/arquivos/${v.id}`, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(100);
});

test("arquivos disfarçados ou fora do padrão são recusados", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await importCreative(page, `${PREFIX} Disfarçado`, [files.fake!]);
  await expect(page.getByTestId("envios")).toContainText("Formato não aceito");
  await importCreative(page, `${PREFIX} Pequena`, [files.small!]);
  await expect(page.getByTestId("envios")).toContainText("pequena demais");
  expect(await prisma.creative.count({ where: { name: { in: [`${PREFIX} Disfarçado`, `${PREFIX} Pequena`] } } })).toBe(0);
  const rejected = await prisma.mediaAsset.findMany({ where: { originalName: { in: ["disfarcado.png", "pequena.png"] } } });
  expect(rejected.every((a) => a.status === "REJEITADO")).toBe(true);
});

test("separação: leitura não envia e outra empresa não vê os arquivos", async ({ page }) => {
  const asset = await prisma.mediaAsset.findFirstOrThrow({
    where: { status: "PRONTO", companyId: DEMO_COMPANY_A, version: { creative: { name: { startsWith: PREFIX } } } },
  });

  await staffLogin(page, "leitura@trafficmanager.test");
  await page.goto("/admin/marketing/biblioteca");
  await expect(page.getByText("Importar criativo")).toHaveCount(0);
  const denied = await page.request.post("/api/v1/admin/marketing/envios", {
    headers: { Origin: new URL(page.url()).origin },
    data: { name: "x.png", type: "image/png", size: 100, purpose: "criativo" },
  });
  expect(denied.status()).toBe(403);
  expect((await page.request.get(`/api/v1/admin/marketing/arquivos/${asset.id}`)).status()).toBe(200);

  // O gestor abre a Empresa B: o arquivo da Empresa A não existe para ele ali.
  await switchUser(page, "gestor@trafficmanager.test", DEMO_COMPANY_B);
  expect((await page.request.get(`/api/v1/admin/marketing/arquivos/${asset.id}`)).status()).toBe(404);
  await page.goto(`/admin/marketing/biblioteca?q=${encodeURIComponent(PREFIX)}`);
  await expect(page.getByTestId("biblioteca")).toHaveCount(0);
});
