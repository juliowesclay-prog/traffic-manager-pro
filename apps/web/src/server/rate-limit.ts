import "server-only";
import { prisma } from "@tmp/db";

/**
 * Limite de tentativas por janela fixa, guardado no Postgres (funciona com vários servidores).
 * Retorna true se a ação ainda é permitida. Ex.: rateLimit(`otp:phone:${hash}`, 3, 15 * 60).
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = rate_limit_buckets."count" + 1
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}

/** Limpeza de janelas antigas (chamada oportunisticamente; o worker fará isso na Fase 3). */
export async function purgeOldBuckets(): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - 86_400_000) } },
  });
}

/** Consulta sem contar: true se ainda há tentativas na janela atual. */
export async function peekRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const row = await prisma.rateLimitBucket.findUnique({ where: { key_windowStart: { key, windowStart } } });
  return (row?.count ?? 0) < limit;
}
