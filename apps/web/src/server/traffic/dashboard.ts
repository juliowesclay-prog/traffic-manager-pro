import "server-only";
import { addDays, formatBRL, metaTokenHealth, trafficAlerts, type AlertCampaign } from "@tmp/core";
import { prisma } from "@/server/db";
import { isMetaSource } from "@/lib/attribution";
import { activeConnection } from "./connection";
import { salesByAd } from "./sales";
import { syncSettings } from "./sync";

/**
 * Painel do Gestor de Tráfego (entrega 8.4): período atual × anterior, série diária, ranking dos
 * anúncios e alertas. Somente leitura; junta números da Meta com as vendas reais da fonte de vendas.
 */

const spStart = (iso: string) => new Date(`${iso}T00:00:00-03:00`);
const DAY = 86_400_000;

export async function trafficDashboard(days: number, now = new Date()) {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  if (!conn || !account) return { account: null } as const;
  const accountId = account.accountId;

  const [cur, prev, week, prevWeek] = await Promise.all([
    salesByAd(days, now),
    salesByAd(days, new Date(now.getTime() - days * DAY)),
    salesByAd(7, now),
    salesByAd(7, new Date(now.getTime() - 7 * DAY)),
  ]);
  if (!cur.account || !prev.account || !week.account || !prevWeek.account) return { account: null } as const;
  const { since, until } = cur;
  const dateRange = (s: string, u: string) => ({
    gte: new Date(`${s}T00:00:00Z`),
    lte: new Date(`${u}T00:00:00Z`),
  });
  const leadWhere = account.isDemo ? {} : { isDemo: false };

  const [
    daily,
    prevDelivery,
    curDelivery,
    adDelivery,
    campaigns,
    ads,
    creatives,
    lastOk,
    settings,
    joinsByDay,
  ] = await Promise.all([
    prisma.metaInsightDaily.groupBy({
      by: ["date"],
      where: { accountId, level: "CAMPANHA", date: dateRange(since, until) },
      _sum: { spend: true },
      orderBy: { date: "asc" },
    }),
    prisma.metaInsightDaily.aggregate({
      where: { accountId, level: "CAMPANHA", date: dateRange(prev.since, prev.until) },
      _sum: { impressions: true, linkClicks: true },
    }),
    prisma.metaInsightDaily.aggregate({
      where: { accountId, level: "CAMPANHA", date: dateRange(since, until) },
      _sum: { impressions: true, linkClicks: true },
    }),
    prisma.metaInsightDaily.groupBy({
      by: ["objectId"],
      where: { accountId, level: "ANUNCIO", date: dateRange(since, until) },
      _sum: { impressions: true, linkClicks: true, spend: true },
    }),
    prisma.metaCampaign.findMany({ where: { accountId } }),
    prisma.metaAd.findMany({ where: { accountId } }),
    prisma.metaCreative.findMany({ where: { accountId } }),
    prisma.metaSyncRun.findFirst({ where: { accountId, status: "OK" }, orderBy: { finishedAt: "desc" } }),
    syncSettings(),
    // Vendas por dia (1ª compra paga) de quem veio da Meta (fonte de vendas).
    prisma.sale.findMany({
      where: { ...leadWhere, first: true, paidAt: { gte: spStart(since), lt: spStart(addDays(until, 1)) } },
      select: {
        paidAt: true,
        lead: { select: { source: true, campaignExternalId: true, adExternalId: true, fbclid: true } },
      },
    }),
  ]);

  // Série diária: investido × vendas vindas da Meta.
  const salesPerDay = new Map<string, number>();
  for (const j of joinsByDay) {
    const a = j.lead;
    if (!(a.campaignExternalId || isMetaSource(a.source))) continue;
    const d = j.paidAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    salesPerDay.set(d, (salesPerDay.get(d) ?? 0) + 1);
  }
  const spendPerDay = new Map(daily.map((d) => [d.date.toISOString().slice(0, 10), d._sum.spend ?? 0]));
  const series: { day: string; spend: number; sales: number }[] = [];
  for (let d = since; d <= until; d = addDays(d, 1))
    series.push({ day: d, spend: spendPerDay.get(d) ?? 0, sales: salesPerDay.get(d) ?? 0 });

  // Ranking dos anúncios (vendas reais + entrega da Meta + miniatura).
  const adStats = new Map(adDelivery.map((r) => [r.objectId, r._sum]));
  const creativeOf = new Map(creatives.map((c) => [c.externalId, c]));
  const salesOfAd = new Map(cur.rows.flatMap((r) => r.ads ?? []).map((a) => [a.key, a]));
  const ranking = ads
    .map((a) => {
      const s = salesOfAd.get(a.externalId);
      const d = adStats.get(a.externalId);
      const c = a.creativeExternalId ? creativeOf.get(a.creativeExternalId) : undefined;
      return {
        id: a.externalId,
        name: a.name,
        campaignId: a.campaignExternalId,
        campaign: campaigns.find((x) => x.externalId === a.campaignExternalId)?.name ?? "",
        effectiveStatus: a.effectiveStatus,
        title: c?.title ?? null,
        thumbnailUrl: c?.thumbnailUrl ?? null,
        spend: d?.spend ?? 0,
        impressions: d?.impressions ?? 0,
        linkClicks: d?.linkClicks ?? 0,
        signups: s?.signups ?? 0,
        sales: s?.sales ?? 0,
        revenue: s?.revenue ?? 0,
      };
    })
    .filter((a) => a.spend > 0 || a.sales > 0);
  const best = [...ranking]
    .filter((a) => a.sales > 0)
    .sort((a, b) => b.sales - a.sales || a.spend / a.sales - b.spend / b.sales)
    .slice(0, 5);
  const worst = [...ranking]
    .filter((a) => a.sales === 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  // Alertas.
  const prevWeekOf = new Map(prevWeek.rows.map((r) => [r.key, r]));
  const alertCampaigns: AlertCampaign[] = campaigns.map((c) => {
    const row = cur.rows.find((r) => r.key === `c:${c.externalId}`);
    const pw = prevWeekOf.get(`c:${c.externalId}`);
    return {
      id: c.externalId,
      name: c.name,
      spend: row?.spend ?? 0,
      sales: row?.sales ?? 0,
      impressions: 0,
      linkClicks: 0,
      effectiveStatus: c.effectiveStatus,
      lifetimeBudget: c.lifetimeBudget,
      budgetRemaining: c.budgetRemaining,
      prevSpend: pw?.spend ?? 0,
      prevSales: pw?.sales ?? 0,
    };
  });
  // "CAC subindo" compara as duas últimas semanas: usa a semana atual no lugar do período.
  const trendCampaigns = alertCampaigns.map((c) => {
    const w = week.rows.find((r) => r.key === `c:${c.id}`);
    return { ...c, weekSpend: w?.spend ?? 0, weekSales: w?.sales ?? 0 };
  });
  const health = metaTokenHealth(conn.tokenExpiresAt, now);
  const averageCac = cur.totals.sales > 0 ? Math.round(cur.totals.spend / cur.totals.sales) : null;
  const periodAlerts = trafficAlerts({
    // Período escolhido: gasto sem venda e orçamento (a tendência vem abaixo, por semana).
    campaigns: alertCampaigns.map((c) => ({ ...c, prevSpend: 0, prevSales: 0 })),
    ads: ranking.map((a) => ({ ...a })),
    averageCac,
    minutesSinceSync: lastOk?.finishedAt
      ? Math.floor((now.getTime() - lastOk.finishedAt.getTime()) / 60_000)
      : null,
    syncIntervalMinutes: settings.intervalMinutes,
    tokenDaysLeft: health.state === "sem_validade" ? null : "daysLeft" in health ? health.daysLeft : 0,
    withoutIds: cur.withoutIds,
    formatMoney: formatBRL,
  });
  const trendAlerts = trafficAlerts({
    campaigns: trendCampaigns.map((c) => ({
      ...c,
      spend: c.weekSpend,
      sales: c.weekSales,
      lifetimeBudget: null,
      budgetRemaining: null,
    })),
    ads: [],
    averageCac: Number.MAX_SAFE_INTEGER, // só a regra de tendência interessa aqui
    minutesSinceSync: 0,
    syncIntervalMinutes: 0,
    tokenDaysLeft: null,
    withoutIds: 0,
    formatMoney: formatBRL,
  }).filter((a) => a.id.startsWith("cac-subindo-"));
  const alerts = [...periodAlerts, ...trendAlerts].sort(
    (a, b) => ["alta", "media", "info"].indexOf(a.level) - ["alta", "media", "info"].indexOf(b.level),
  );

  return {
    account: { name: account.name, isDemo: account.isDemo },
    since,
    until,
    current: {
      ...cur.totals,
      impressions: curDelivery._sum.impressions ?? 0,
      linkClicks: curDelivery._sum.linkClicks ?? 0,
    },
    previous: {
      ...prev.totals,
      impressions: prevDelivery._sum.impressions ?? 0,
      linkClicks: prevDelivery._sum.linkClicks ?? 0,
    },
    series,
    best,
    worst,
    /** Todos os anúncios com entrega ou venda no período (usado pela IA analista). */
    ads: ranking,
    salesRows: cur.rows,
    withoutIds: cur.withoutIds,
    alerts,
    lastSync: lastOk?.finishedAt ?? null,
  } as const;
}
