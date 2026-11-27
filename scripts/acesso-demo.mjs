// Mostra no SEU terminal os acessos de DEMONSTRAÇÃO para testar o sistema localmente:
// endereços, e-mails e a senha de demonstração (DEMO_USER_PASSWORD do .env).
// Só funciona em desenvolvimento; nada é enviado para fora.
// Uso: pnpm demo:acesso
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
if (env.APP_ENV === "production") {
  console.error("Recusado: APP_ENV=production. Acessos de demonstração não existem em produção.");
  process.exit(1);
}
const url = (env.APP_URL || "http://localhost:3300").replace(/\/$/, "");
const password = env.DEMO_USER_PASSWORD;
if (!password) {
  console.error("Falta DEMO_USER_PASSWORD no .env. Rode: pnpm env:init && pnpm --filter @tmp/db db:seed:demo");
  process.exit(1);
}

console.log(`
TRAFFIC MANAGER PRO — ACESSOS DE DEMONSTRAÇÃO (somente no seu computador)

Painel:  ${url}/admin/entrar

Senha de todos os usuários abaixo:  ${password}

  superadmin@trafficmanager.test   Superadministrador (todas as empresas, cadastra empresas e chaves)
  gestor@trafficmanager.test       Gestor de tráfego (DEMO Empresa A e B; aprova ações)
  marketing@trafficmanager.test    Marketing (DEMO Empresa A)
  leitura@trafficmanager.test      Só leitura (DEMO Empresa A)
  semempresa@trafficmanager.test   Sem empresa liberada (para testar o bloqueio)

Meta e IA: SIMULADAS em desenvolvimento (META_PROVIDER=simulado, AI_PROVIDER=simulado).
Rotina automática (sincronização e conversões): deixe rodando também  pnpm worker
`);
