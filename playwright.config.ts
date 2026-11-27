import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

// Os testes de login usam os usuários de demonstração (pnpm db:seed:demo) e o banco local.
if (existsSync(".env")) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(".env", "utf8"))))
    process.env[key] ??= value;
}

/**
 * Testes de ponta a ponta + acessibilidade (axe). Usam o site local com o banco de desenvolvimento.
 * Rode com: pnpm test:e2e  (não faz parte de `pnpm test`).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    // Opcional: navegador já instalado em outro lugar (ex.: ambiente na nuvem).
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Fluxos de autenticação mexem no banco: rodam só no desktop.
    { name: "celular", use: { ...devices["Pixel 7"] }, testIgnore: /autenticacao/ },
  ],
  // Com E2E_BASE_URL (ex.: build de produção em http://localhost:3301), usa o servidor já rodando.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @tmp/web dev",
        url: "http://localhost:3300/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
