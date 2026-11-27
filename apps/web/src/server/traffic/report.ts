import "server-only";
import { addDays, dayInTimeZone, metaSituation, type MetaSituation } from "@prosed/core";
import { prisma } from "@prosed/db";
import { activeConnection } from "./connection";
import { syncSettings } from "./sync";

/** Números das campanhas da conta escolhida num período (como a Meta informa). Só leitura. */

export interface Metrics {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingViews: number;
  leads: number;
  conversations: number;
  purchases: number;
  purchaseValue: number;
}
const FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "linkClicks",
  "landingViews",
  "leads",
  "conversations",
  "purchases",
  "purchaseValue",
] as const;
const zero = (): Metrics => Object.fromEntries(FIELDS.map((f) => [f, 0])) as unknown as Metrics;

export interface Node {
  externalId: string;
  name: string;
  situation: MetaSituation;
  metrics: Metrics;
}

export async function campaignsReport(days: number, now = new Date()) {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  if (!account) return { connected: !!conn, account: null } as const;
  const accountId = account.accountId;
  const until = dayInTimeZone(now, account.timezone);
  const since = addDays(until, -(days - 1));
  const range = { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${until}T00:00:00Z`) };

  const [campaigns, adSets, ads, creatives, sums, runs, settings] = await Promise.all([
    prisma.metaCampaign.findMany({ where: { accountId }, orderBy: { name: "asc" } }),
    prisma.metaAdSet.findMany({ where: { accountId }, orderBy: { name: "asc" } }),
    prisma.metaAd.findMany({ where: { accountId }, orderBy: { name: "asc" } }),
    prisma.metaCreative.findMany({ where: { accountId } }),
    prisma.metaInsightDaily.groupBy({
      by: ["level", "objectId"],
      where: { accountId, date: range },
      _sum: Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<(typeof FIELDS)[number], true>,
    }),
    prisma.metaSyncRun.findMany({ where: { accountId }, orderBy: { startedAt: "desc" }, take: 8 }),
    syncSettings(),
  ]);

  const byKey = new Map<string, Metrics>(
    sums.map((s) => [
      `${s.level}:${s.objectId}`,
      Object.fromEntries(FIELDS.map((f) => [f, s._sum[f] ?? 0])) as unknown as Metrics,
    ]),
  );
  const metrics = (level: string, id: string) => byKey.get(`${level}:${id}`) ?? zero();
  const creativeOf = new Map(creatives.map((c) => [c.externalId, c]));

  const tree = campaigns.map((c) => ({
    externalId: c.externalId,
    name: c.name,
    objective: c.objective,
    dailyBudget: c.dailyBudget,
    lifetimeBudget: c.lifetimeBudget,
    situation: metaSituation(c.effectiveStatus, c.stopTime, c.missingSince, now),
    metrics: metrics("CAMPANHA", c.externalId),
    adSets: adSets
      .filter((s) => s.campaignExternalId === c.externalId)
      .map((s) => ({
        externalId: s.externalId,
        name: s.name,
        targeting: s.targetingSummary,
        situation: metaSituation(s.effectiveStatus, s.endTime, s.missingSince, now),
        metrics: metrics("CONJUNTO", s.externalId),
        ads: ads
          .filter((a) => a.adSetExternalId === s.externalId)
          .map((a) => {
            const creative = a.creativeExternalId ? creativeOf.get(a.creativeExternalId) : undefined;
            return {
              externalId: a.externalId,
              name: a.name,
              title: creative?.title ?? null,
              body: creative?.body ?? null,
              situation: metaSituation(a.effectiveStatus, null, a.missingSince, now),
              metrics: metrics("ANUNCIO", a.externalId),
            };
          }),
      })),
  }));
  // Mais gasto primeiro; ativas antes quando empatadas.
  tree.sort(
    (a, b) =>
      b.metrics.spend - a.metrics.spend || Number(b.situation === "ativa") - Number(a.situation === "ativa"),
  );
  const totals = tree.reduce((t, c) => {
    for (const f of FIELDS) t[f] += c.metrics[f];
    return t;
  }, zero());

  return {
    connected: true,
    account: { accountId, name: account.name, currency: account.currency, isDemo: account.isDemo },
    since,
    until,
    tree,
    totals,
    runs,
    interval: settings.intervalMinutes,
    lastOk: runs.find((r) => r.status === "OK") ?? null,
    connectionError: conn?.lastError ?? null,
  } as const;
}
