import "server-only";
import { addNumbers, EMPTY_NUMBERS, rankCreatives, type CreativePerf } from "@tmp/core";
import { prisma } from "../db";
import { salesByAd } from "../traffic/sales";

/**
 * Desempenho dos criativos (Etapa 7). Junta, por criativo, os números da Meta (nível anúncio,
 * já sincronizados) de todos os anúncios ligados a ele com as vendas reais da fonte de vendas.
 * Somente leitura; o período é sempre o da conta de anúncios escolhida.
 */
export async function creativePerformance(days: number) {
  const sales = await salesByAd(days);
  if (!sales.account) return { account: null } as const;
  const { since, until } = sales;
  const creatives = await prisma.creative.findMany({
    where: { NOT: { metaAdIds: { isEmpty: true } } },
    select: { id: true, name: true, kind: true, metaAdIds: true, status: true },
  });
  const adIds = [...new Set(creatives.flatMap((c) => c.metaAdIds))];
  const insights = adIds.length
    ? await prisma.metaInsightDaily.groupBy({
        by: ["objectId"],
        where: {
          accountId: sales.account.accountId,
          level: "ANUNCIO",
          objectId: { in: adIds },
          date: { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${until}T00:00:00Z`) },
        },
        _sum: {
          spend: true,
          impressions: true,
          linkClicks: true,
          leads: true,
          registrations: true,
          purchases: true,
        },
      })
    : [];
  const meta = new Map(insights.map((r) => [r.objectId, r._sum]));
  const real = new Map(sales.rows.flatMap((r) => r.ads ?? []).map((a) => [a.key, a]));

  const list: (CreativePerf & { status: string })[] = creatives.map((c) => {
    let n = EMPTY_NUMBERS;
    for (const ad of c.metaAdIds) {
      const m = meta.get(ad);
      const s = real.get(ad);
      n = addNumbers(n, {
        spend: m?.spend ?? 0,
        impressions: m?.impressions ?? 0,
        linkClicks: m?.linkClicks ?? 0,
        leads: (m?.leads ?? 0) + (m?.registrations ?? 0),
        purchases: m?.purchases ?? 0,
        sales: s?.sales ?? 0,
        revenue: s?.revenue ?? 0,
      });
    }
    return { id: c.id, name: c.name, kind: c.kind, status: c.status, ads: c.metaAdIds.length, numbers: n };
  });
  return { account: sales.account, since, until, creatives: rankCreatives(list) } as const;
}
