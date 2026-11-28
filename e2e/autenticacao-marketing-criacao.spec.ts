import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { DEMO_COMPANY_A, prisma, resetRateLimits, staffLogin } from "./helpers";

/**
 * Marketing IA — Etapas 2 a 4: Estúdio IA (simulado), Criar Artes (prévia e PNG reais desenhados no
 * servidor, foto por IA simulada, edição em versão nova), Criar Carrossel (páginas + ZIP) e Editor de
 * Vídeos (fila + servidor de vídeo com FFmpeg de verdade: transcrição simulada, cortes, formatos,
 * legendas, encerramento). Dados DEMO.
 */
test.describe.configure({ mode: "serial" });

const DIR = path.join("test-results", "marketing-criacao");
const PREFIX = "DEMO E2E Criação";
let brandId = "";

async function cleanup() {
  await prisma.videoJob.deleteMany({ where: { creative: { name: { startsWith: PREFIX } } } });
  await prisma.creative.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.marketingGeneration.deleteMany({
    where: { companyId: DEMO_COMPANY_A, input: { path: ["assunto"], string_starts_with: PREFIX } },
  });
}

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  await cleanup();
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "gestor@trafficmanager.test" } });
  const b = await prisma.brand.create({
    data: {
      companyId: DEMO_COMPANY_A,
      name: `${PREFIX} Marca`,
      colors: ["#0F5132", "#FFC107"],
      headingFont: "Montserrat",
      bodyFont: "Lato",
      ctas: ["Chame no WhatsApp"],
      createdById: admin.id,
      isDemo: true,
      facts: {
        create: [
          {
            companyId: DEMO_COMPANY_A,
            kind: "BENEFICIO",
            title: "Atendimento no mesmo dia",
            status: "APROVADO",
            createdById: admin.id,
            approvedById: admin.id,
            approvedAt: new Date(),
          },
          {
            companyId: DEMO_COMPANY_A,
            kind: "PRECO",
            title: "R$ 999,00 por mês",
            status: "RASCUNHO",
            createdById: admin.id,
          },
        ],
      },
    },
  });
  brandId = b.id;
});
test.afterAll(cleanup);
test.beforeEach(async () => {
  await resetRateLimits();
});

/** Roda o servidor de vídeo uma vez (pega e processa o que houver na fila, depois sai). */
function runWorker() {
  execFileSync("pnpm", ["--filter", "@tmp/video-worker", "start", "--", "--uma-vez"], {
    stdio: "pipe",
    env: {
      ...process.env,
      APP_URL: process.env.E2E_BASE_URL ?? "http://localhost:3300",
      VIDEO_WORKER_IDLE_MS: "200",
    },
    timeout: 180_000,
  });
}

async function pngSize(page: Page, url: string) {
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const img = PNG.sync.read(Buffer.from(await res.body()));
  return [img.width, img.height];
}

test("Estúdio IA usa só informações aprovadas e leva a ideia para a arte", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/marketing/estudio");
  await page.getByLabel("Marca", { exact: true }).selectOption(brandId);
  await page.getByLabel("Objetivo").selectOption("whatsapp");
  await page.getByLabel("Assunto do anúncio").fill(`${PREFIX} consulta`);
  await page.getByRole("button", { name: "Criar conteúdos" }).click();
  const result = page.getByTestId("resultado-estudio");
  await expect(result).toBeVisible();
  await expect(result).toContainText("DEMO");
  await expect(page.getByTestId("titulos")).toContainText(`${PREFIX} consulta`);
  // Benefício aprovado entra; preço em rascunho nunca.
  await expect(page.getByTestId("textos")).toContainText("Atendimento no mesmo dia");
  await expect(result).not.toContainText("999");

  await page.getByLabel("Pedir ajuste").fill("mais curto");
  await page.getByRole("button", { name: "Ajustar" }).click();
  await expect(page.getByTestId("resultado-estudio")).toContainText("ajuste: mais curto");
  await expect(page.getByTestId("historico-estudio").getByRole("listitem"))
    .toHaveCount(2, { timeout: 10_000 })
    .catch(() => undefined);

  await page.getByRole("link", { name: "Criar esta arte" }).first().click();
  await expect(page).toHaveURL(/\/admin\/marketing\/artes\?geracao=/);
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(`${PREFIX} consulta`);
});

test("Criar Artes: prévia, foto por IA, salvar PNG real e editar em versão nova", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/marketing/artes");
  await page.getByLabel("Formato").selectOption("retrato");
  await page.getByLabel("Marca", { exact: true }).selectOption(brandId);
  await page.getByLabel("Título", { exact: true }).fill("Cura garantida para você");
  await page.getByLabel("Texto de apoio").fill("Atendimento no mesmo dia");
  await expect(page.getByTestId("previa-arte").locator("img")).toHaveAttribute("src", /^blob:/, {
    timeout: 15_000,
  });

  await page.getByLabel("Ou gere a foto por IA").fill("consultório claro e acolhedor");
  await page.getByRole("button", { name: "Gerar foto" }).click();
  await expect(page.getByText("Imagem DEMO criada")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Foto", { exact: true })).not.toHaveValue("");

  await page.getByLabel("Nome do criativo").fill(`${PREFIX} Arte`);
  await page.getByRole("button", { name: "Salvar na biblioteca" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByTestId("status-criativo")).toHaveText("Rascunho");
  const id = page.url().split("/").pop()!;
  const c = await prisma.creative.findFirstOrThrow({
    where: { id },
    include: { versions: { include: { assets: true } } },
  });
  expect(c.origin).toBe("IA");
  const asset = c.versions[0]!.assets[0]!;
  expect([asset.width, asset.height]).toEqual([1080, 1350]);
  expect(await pngSize(page, `/api/v1/admin/marketing/arquivos/${asset.id}`)).toEqual([1080, 1350]);
  // A foto de fundo usada fica guardada (não é apagada pela limpeza).
  const spec = c.versions[0]!.spec as { backgroundAssetId: string };
  expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: spec.backgroundAssetId } })).purpose).toBe(
    "fundo",
  );

  await page.getByRole("link", { name: "Editar a arte" }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Cura garantida para você");
  await page.getByLabel("Título", { exact: true }).fill("Atendimento no mesmo dia");
  await page.getByLabel("O que mudou nesta versão").fill("título sem promessa");
  await page.getByRole("button", { name: "Salvar como nova versão" }).click();
  await expect(page).toHaveURL(new RegExp(`/biblioteca/${id}$`), { timeout: 30_000 });
  await expect(page.getByTestId("versoes")).toContainText("Versão 2");
  await expect(page.getByTestId("versoes")).toContainText("título sem promessa");
});

test("Criar Carrossel: páginas, PNG de cada página e ZIP", async ({ page }) => {
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/marketing/carrossel");
  await page.getByLabel("Título da página 1").fill(`${PREFIX} capa`);
  await page.getByLabel("Título da página 2").fill("Como funciona");
  await page.getByLabel("Texto da página 2").fill("Passo a passo simples.");
  await page.getByLabel("Título da página 3").fill("Fale com a gente");
  await page.getByRole("button", { name: "Adicionar página" }).click();
  await page.getByLabel("Título da página 4").fill("Última");
  await page.getByLabel("Chamada final (botão da última página)").fill("Saiba mais");
  await page.getByRole("button", { name: "Ver esta página na prévia" }).nth(1).click();
  await expect(page.getByTestId("previa-arte").locator("img")).toHaveAttribute("alt", "Prévia da página 2", {
    timeout: 15_000,
  });
  await page.getByLabel("Nome do criativo").fill(`${PREFIX} Carrossel`);
  await page.getByRole("button", { name: "Gerar e salvar o carrossel" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: /Prévia da versão 1 \(4 páginas\)/ })).toBeVisible();

  const zipLink = page.getByRole("link", { name: "Baixar todas as páginas (ZIP)" });
  const res = await page.request.get((await zipLink.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const body = Buffer.from(await res.body());
  expect(body.subarray(0, 4).toString("hex")).toBe("504b0304");
  // Diretório central com 4 arquivos.
  expect(body.readUInt16LE(body.length - 22 + 10)).toBe(4);
});

test("Editor de vídeos: transcrição, cortes, formatos e encerramento pelo servidor de vídeo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const video = path.join(DIR, "bruto.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=720x1280:rate=25:duration=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:duration=6",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      video,
    ],
    { stdio: "ignore" },
  );
  await staffLogin(page, "marketing@trafficmanager.test");
  await page.goto("/admin/marketing/biblioteca");
  await page.getByText("Importar criativo").click();
  await page.getByLabel("Nome do criativo").fill(`${PREFIX} Vídeo bruto`);
  await page.getByLabel("Marca", { exact: true }).selectOption(brandId);
  await page.getByLabel("Arquivos").setInputFiles([video]);
  await page.getByRole("button", { name: "Enviar para a biblioteca" }).click();
  await expect(page).toHaveURL(/\/admin\/marketing\/biblioteca\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Editar no editor de vídeos" }).click();
  await expect(page.getByTestId("editor-video")).toBeVisible();

  await page.getByRole("button", { name: /Transcrever a fala/ }).click();
  await expect(page.getByText("Transcrição na fila")).toBeVisible();
  runWorker();
  await page.reload();
  await expect(page.getByTestId("fila-video")).toContainText("Transcrição · Pronto");
  await expect(page.getByLabel("Texto das legendas")).toHaveValue(/DEMO legenda 1/);
  await expect(page.getByTestId("servidor-video")).toContainText("Servidor de vídeo ligado");

  await page.getByLabel("Nome dos vídeos gerados").fill(`${PREFIX} Vídeo editado`);
  await page.getByLabel("Começa em (segundos)").fill("1");
  await page.getByLabel("Quadrado 1:1").check();
  await page.getByLabel("Encerramento com chamada para ação no fim").check();
  await page.getByLabel("Texto do encerramento").fill("Fale com a gente");
  await page.getByRole("button", { name: "Gerar os vídeos" }).click();
  await expect(page.getByText("Edição na fila (2 formatos)")).toBeVisible();
  runWorker();
  await page.reload();
  const fila = page.getByTestId("fila-video");
  await expect(fila).toContainText("Edição: 9:16, 1:1 · Pronto");
  await expect(fila.getByRole("link", { name: `${PREFIX} Vídeo editado (9:16)` })).toBeVisible();

  const outs = await prisma.creative.findMany({
    where: { name: { startsWith: `${PREFIX} Vídeo editado` } },
    include: { versions: { include: { assets: true } } },
  });
  expect(outs).toHaveLength(2);
  const vertical = outs.find((o) => o.name.endsWith("(9:16)"))!.versions[0]!.assets[0]!;
  expect([vertical.width, vertical.height]).toEqual([1080, 1920]);
  // 5 s do vídeo (cortou 1 s do início) + 3 s de encerramento.
  expect(vertical.durationMs).toBeGreaterThan(7500);
  expect(vertical.durationMs).toBeLessThan(8500);
  const res = await page.request.get(`/api/v1/admin/marketing/arquivos/${vertical.id}`);
  expect(res.headers()["content-type"]).toBe("video/mp4");
});
