import { hkdfSync } from "node:crypto";

/**
 * Prévia de teste na Vercel (VERCEL=1): completa a configuração para que quem cria o projeto só
 * precise informar SEGREDO_MESTRE (frase longa, só no cofre da Vercel), SEED_ADMIN_EMAIL e
 * SEED_ADMIN_PASSWORD, além do banco (DATABASE_URL vem da integração Neon).
 * - As chaves internas (cifra, pepper, rotina) são DERIVADAS do segredo mestre (HKDF-SHA256): nada
 *   aleatório precisa ser digitado, e trocar o segredo mestre exige recriar o banco de teste.
 * - Ambiente "homologacao": Meta e IA SIMULADAS por padrão. Nunca vale para APP_ENV=production.
 * Só preenche o que estiver vazio; uma variável definida na Vercel sempre vence.
 */
export function applyHostedDefaults(env: NodeJS.ProcessEnv = process.env): void {
  if (env.VERCEL !== "1") return;
  env.APP_ENV ||= "homologacao";
  if (env.APP_ENV === "production") return;

  env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || "";
  if (!env.APP_URL && env.VERCEL_PROJECT_PRODUCTION_URL) env.APP_URL = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  env.TRUST_PROXY_HOPS ||= "1"; // a Vercel fica na frente do site
  env.META_PROVIDER ||= "simulado";
  env.AI_PROVIDER ||= "simulado";

  const master = env.SEGREDO_MESTRE ?? "";
  if (master.length < 32) {
    if (!env.DATA_ENCRYPTION_KEY || !env.HASH_PEPPER || !env.CRON_SECRET)
      console.error("Configuração: defina SEGREDO_MESTRE (32+ caracteres) nas variáveis da Vercel.");
    return;
  }
  const derive = (label: string) =>
    Buffer.from(hkdfSync("sha256", master, "traffic-manager-pro", label, 32));
  env.DATA_ENCRYPTION_KEY ||= derive("data-encryption-key").toString("base64");
  env.HASH_PEPPER ||= derive("hash-pepper").toString("base64");
  env.CRON_SECRET ||= derive("cron-secret").toString("base64url");
}
