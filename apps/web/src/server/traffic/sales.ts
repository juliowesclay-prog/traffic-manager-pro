import "server-only";
import { addDays, costPer, dayInTimeZone } from "@tmp/core";
import { prisma } from "@/server/db";
import { isMetaSource } from "@/lib/attribution";
import { activeConnection } from "./connection";

/**
 * Vendas por anúncio: junta o INVESTIMENTO (Meta) com as VENDAS REAIS informadas pela fonte de vendas
 * (API /api/v1/eventos, ver server/sales-source.ts).
 * - Cadastros: leads criados no período, pela origem informada (utm/fbclid do link de entrada).
 * - Vendas: primeira compra paga no período, de leads com origem.
 * - Receita: vendas pagas no período por esses leads, menos estornos no período.
 * - CAC = investido ÷ vendas; retorno = receita ÷ investido. Somente leitura.
 * Dados DEMO só entram quando a própria conta de anúncios é DEMO (ambiente de testes).
 */

/** Origem do lead (null quando não veio de nenhum link marcado). */
const ATTR = {
  source: true,
  campaignExternalId: true,
  adExternalId: true,
  fbclid: true,
} as const;
type LeadAttr = { source: string | null; campaignExternalId: string | null; adExternalId: string | null; fbclid: string | null };
export const attrOf = (l: LeadAttr) => (l.source || l.campaignExternalId || l.fbclid ? l : null);
const spStart = (iso: string) => new Date(`${iso}T00:00:00-03:00`);

export interface SalesRow {
  key: string;
  label: string;
  kind: "campanha" | "meta_sem_id" | "outra_origem" | "sem_origem";
  situation?: string;
  spend: number;
  signups: number;
  sales: number;
  revenue: number;
  ads?: SalesRow[];
}

export const cac = (r: { spend: number; sales: number }) => costPer(r.spend, r.sales);
export const roas = (r: { spend: number; revenue: number }) =>
  r.spend > 0 ? Math.round((r.revenue / r.spend) * 100) / 100 : null;

export async function salesByAd(days: number, now = new Date()) {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  if (!account) return { account: null } as const;
  const accountId = account.accountId;
  const until = dayInTimeZone(now, account.timezone);
  const since = addDays(until, -(days - 1));
  const from = spStart(since);
  const to = spStart(addDays(until, 1));
  const demo = account.isDemo ? {} : { isDemo: false };

  const [campaigns, ads, spendRows, signups, joins, paid, refunded] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: { accountId },
      select: { externalId: true, name: true, effectiveStatus: true },
    }),
    prisma.metaAd.findMany({
      where: { accountId },
      select: { externalId: true, name: true, campaignExternalId: true },
    }),
    prisma.metaInsightDaily.groupBy({
      by: ["level", "objectId"],
      where: {
        accountId,
        level: { in: ["CAMPANHA", "ANUNCIO"] },
        date: { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${until}T00:00:00Z`) },
      },
      _sum: { spend: true },
    }),
    // Cadastros no período (com e sem origem).
    prisma.lead.findMany({
      where: { ...demo, createdAt: { gte: from, lt: to } },
      select: { id: true, ...ATTR },
    }),
    // Vendas (1ª compra paga) no período.
    prisma.sale.findMany({
      where: { ...demo, first: true, paidAt: { gte: from, lt: to } },
      select: { lead: { select: { id: true, ...ATTR } } },
    }),
    // Receita: tudo o que foi pago no período (estornos descontados abaixo).
    prisma.sale.findMany({
      where: { ...demo, paidAt: { gte: from, lt: to } },
      select: { amount: true, lead: { select: ATTR } },
    }),
    prisma.sale.findMany({
      where: { ...demo, status: "ESTORNADA", refundedAt: { gte: from, lt: to } },
      select: { amount: true, lead: { select: ATTR } },
    }),
  ]);

  const spendOf = new Map(spendRows.map((r) => [`${r.level}:${r.objectId}`, r._sum.spend ?? 0]));
  const known = new Set(campaigns.map((c) => c.externalId));
  type Attr = LeadAttr;

  /** Em qual linha cai uma origem. */
  const bucket = (a: Attr | null): string => {
    if (!a) return "sem_origem";
    if (a.campaignExternalId) return `c:${a.campaignExternalId}`;
    return isMetaSource(a.source) ? "meta_sem_id" : "outra_origem";
  };
  const rows = new Map<string, SalesRow>();
  const row = (key: string): SalesRow => {
    let r = rows.get(key);
    if (!r) {
      const id = key.startsWith("c:") ? key.slice(2) : null;
      const c = id ? campaigns.find((x) => x.externalId === id) : null;
      r = {
        key,
        label: id
          ? (c?.name ?? `Campanha ${id} (fora da conta escolhida)`)
          : key === "meta_sem_id"
            ? "Facebook/Instagram sem identificação do anúncio"
            : key === "outra_origem"
              ? "Outras origens (links com utm)"
              : "Sem origem (direto, busca, indicação…)",
        kind: id ? "campanha" : (key as SalesRow["kind"]),
        situation: c?.effectiveStatus,
        spend: id ? (spendOf.get(`CAMPANHA:${id}`) ?? 0) : 0,
        signups: 0,
        sales: 0,
        revenue: 0,
        ads: id ? [] : undefined,
      };
      rows.set(key, r);
    }
    return r;
  };
  const adRow = (parent: SalesRow, adId: string): SalesRow => {
    let r = parent.ads!.find((x) => x.key === adId);
    if (!r) {
      r = {
        key: adId,
        label: ads.find((a) => a.externalId === adId)?.name ?? `Anúncio ${adId}`,
        kind: "campanha",
        spend: spendOf.get(`ANUNCIO:${adId}`) ?? 0,
        signups: 0,
        sales: 0,
        revenue: 0,
      };
      parent.ads!.push(r);
    }
    return r;
  };
  const add = (a: Attr | null, f: "signups" | "sales" | "revenue", v: number) => {
    const r = row(bucket(a));
    r[f] += v;
    if (a?.campaignExternalId && a.adExternalId) adRow(r, a.adExternalId)[f] += v;
  };

  // Toda campanha com gasto aparece, mesmo sem venda.
  for (const c of campaigns) if ((spendOf.get(`CAMPANHA:${c.externalId}`) ?? 0) > 0) row(`c:${c.externalId}`);
  for (const r of rows.values())
    if (r.ads)
      for (const a of ads.filter((x) => `c:${x.campaignExternalId}` === r.key))
        if ((spendOf.get(`ANUNCIO:${a.externalId}`) ?? 0) > 0) adRow(r, a.externalId);

  for (const l of signups) add(attrOf(l), "signups", 1);
  // Uma venda por cliente no período (a primeira compra); sem origem cai em "sem_origem".
  const soldLeads = new Set<string>();
  for (const j of joins) {
    if (soldLeads.has(j.lead.id)) continue;
    soldLeads.add(j.lead.id);
    add(attrOf(j.lead), "sales", 1);
  }
  for (const c of paid) add(attrOf(c.lead), "revenue", c.amount);
  for (const c of refunded) add(attrOf(c.lead), "revenue", -c.amount);

  const order: Record<SalesRow["kind"], number> = {
    campanha: 0,
    meta_sem_id: 1,
    outra_origem: 2,
    sem_origem: 3,
  };
  const list = [...rows.values()]
    .map((r) => ({ ...r, ads: r.ads?.sort((a, b) => b.spend - a.spend || b.sales - a.sales) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || b.spend - a.spend || b.sales - a.sales);
  const meta = list.filter((r) => r.kind === "campanha" || r.kind === "meta_sem_id");
  const sum = (xs: SalesRow[], f: "spend" | "signups" | "sales" | "revenue") =>
    xs.reduce((s, r) => s + r[f], 0);
  const totals = {
    spend: sum(meta, "spend"),
    signups: sum(meta, "signups"),
    sales: sum(meta, "sales"),
    revenue: sum(meta, "revenue"),
  };

  return {
    account: { name: account.name, isDemo: account.isDemo, accountId },
    since,
    until,
    rows: list,
    totals,
    unknownCampaigns: list.filter((r) => r.kind === "campanha" && !known.has(r.key.slice(2))).length,
    withoutIds: rows.get("meta_sem_id")?.signups ?? 0,
  } as const;
}
