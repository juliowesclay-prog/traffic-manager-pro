import { timingSafeEqual } from "node:crypto";
import { prisma as base } from "@tmp/db";
import { purgeOldBuckets } from "@/server/rate-limit";
import { runWithCompany } from "@/server/tenant";
import { conversionsTick, purgeOldClickIds } from "@/server/traffic/conversions";
import { autoSyncIfDue } from "@/server/traffic/sync";

/**
 * Rotina periódica (chamada a cada ~30 s pelo `pnpm worker` ou pelo agendador da hospedagem).
 * Para CADA empresa ativa, isolada das demais: atualiza os anúncios da Meta no intervalo configurado
 * e envia as conversões (API de Conversões). Uma falha numa empresa não atrapalha as outras.
 * Protegida por CRON_SECRET no cabeçalho x-tarefa-secret. Idempotente.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("x-tarefa-secret") ?? "";
  if (
    secret.length < 16 ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  }
  const companies = await base.company.findMany({ where: { status: "ATIVA" }, select: { id: true, slug: true } });
  const empresas: Record<string, unknown> = {};
  for (const c of companies) {
    empresas[c.slug] = await runWithCompany(c.id, async () => {
      const anuncios = await autoSyncIfDue().catch((e) => {
        console.error(`Rotina dos anúncios (${c.slug}):`, e);
        return "erro" as const;
      });
      const conversoes = await conversionsTick().catch((e) => {
        console.error(`Rotina das conversões (${c.slug}):`, e);
        return "erro" as const;
      });
      const limpeza = await purgeOldClickIds().catch(() => 0);
      return { anuncios, conversoes, limpeza };
    });
  }
  await purgeOldBuckets().catch(() => undefined);
  return Response.json({ empresas });
}
