// Mostra no SEU terminal os acessos de DEMONSTRAÇÃO para testar o sistema localmente:
// endereços, e-mails, a senha de demonstração (DEMO_USER_PASSWORD do .env) e o código do autenticador
// (MFA), que muda a cada 30 segundos. Só funciona em desenvolvimento; nada é enviado para fora.
// Uso: pnpm demo:acesso
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
if (env.APP_ENV === "production") {
  console.error("Recusado: APP_ENV=production. Acessos de demonstração não existem em produção.");
  process.exit(1);
}
const url = (env.APP_URL || "http://localhost:3300").replace(/\/$/, "");
const password = env.DEMO_USER_PASSWORD;
const secret = env.DEMO_MFA_SECRET;
if (!password || !secret) {
  console.error("Faltam DEMO_USER_PASSWORD/DEMO_MFA_SECRET no .env. Rode: pnpm env:init && pnpm --filter @tmp/db db:seed:demo");
  process.exit(1);
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return { code, secondsLeft: 30 - (Math.floor(now / 1000) % 30) };
}

const { code, secondsLeft } = totp();
console.log(`
TRAFFIC MANAGER PRO — ACESSOS DE DEMONSTRAÇÃO (somente no seu computador)

Painel:  ${url}/admin/entrar

Senha de todos os usuários abaixo:  ${password}
Código do autenticador agora:       ${code}   (vale mais ${secondsLeft} s; rode de novo para um novo)

  superadmin@trafficmanager.test   Superadministrador (todas as empresas, cadastra empresas e chaves)
  gestor@trafficmanager.test       Gestor de tráfego (DEMO Empresa A e B; aprova ações)
  marketing@trafficmanager.test    Marketing (DEMO Empresa A)
  leitura@trafficmanager.test      Só leitura (DEMO Empresa A)
  semempresa@trafficmanager.test   Sem empresa liberada (para testar o bloqueio)

Meta e IA: SIMULADAS em desenvolvimento (META_PROVIDER=simulado, AI_PROVIDER=simulado).
Rotina automática (sincronização e conversões): deixe rodando também  pnpm worker
Para usar seu próprio autenticador (Google Authenticator etc.), cadastre a chave DEMO_MFA_SECRET do .env.
`);
