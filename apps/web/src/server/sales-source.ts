import "server-only";
import { parseSalesBatch, type SalesEvent } from "@tmp/core";
import { prisma } from "./db";

/**
 * Fonte de vendas: grava os cadastros, vendas e estornos que os sistemas da empresa enviam pela API.
 * Roda SEMPRE dentro de runWithCompany() (a empresa vem da chave da API).
 * Idempotente: o mesmo "id" enviado de novo não duplica (resposta "repetido").
 */

export type IngestStatus = "gravado" | "repetido" | "erro";
export interface IngestItem {
  indice: number;
  status: IngestStatus;
  erro?: string;
}

async function ingestOne(e: SalesEvent, isDemo: boolean): Promise<Omit<IngestItem, "indice">> {
  if (e.kind === "LEAD") {
    const exists = await prisma.lead.findFirst({ where: { externalId: e.externalId }, select: { id: true } });
    if (exists) return { status: "repetido" };
    const a = e.attribution;
    await prisma.lead.create({
      data: {
        externalId: e.externalId,
        createdAt: e.at,
        source: a?.source ?? null,
        medium: a?.medium ?? null,
        campaign: a?.campaign ?? null,
        term: a?.term ?? null,
        content: a?.content ?? null,
        campaignExternalId: a?.campaignExternalId ?? null,
        adSetExternalId: a?.adSetExternalId ?? null,
        adExternalId: a?.adExternalId ?? null,
        fbclid: a?.fbclid ?? null,
        clickedAt: a ? new Date(a.clickedAt) : null,
        landingUrl: e.landingUrl,
        isDemo,
      },
    });
    return { status: "gravado" };
  }
  if (e.kind === "SALE") {
    const lead = await prisma.lead.findFirst({ where: { externalId: e.leadExternalId }, select: { id: true } });
    if (!lead) return { status: "erro", erro: "Cliente não encontrado: envie o cadastro antes da venda." };
    const exists = await prisma.sale.findFirst({ where: { externalId: e.externalId }, select: { id: true } });
    if (exists) return { status: "repetido" };
    await prisma.sale.create({
      data: {
        externalId: e.externalId,
        leadId: lead.id,
        amount: e.valueCents,
        first: e.first,
        paidAt: e.at,
        isDemo,
      },
    });
    return { status: "gravado" };
  }
  const r = await prisma.sale.updateMany({
    where: { externalId: e.externalId, status: "PAGA" },
    data: { status: "ESTORNADA", refundedAt: e.at },
  });
  if (r.count) return { status: "gravado" };
  const sale = await prisma.sale.findFirst({ where: { externalId: e.externalId }, select: { status: true } });
  return sale ? { status: "repetido" } : { status: "erro", erro: "Venda não encontrada para estornar." };
}

export async function ingestSalesEvents(body: unknown, isDemo: boolean, now = new Date()) {
  const parsed = parseSalesBatch(body, now);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const itens: IngestItem[] = [];
  for (const [indice, r] of parsed.results.entries()) {
    if (!r.ok) {
      itens.push({ indice, status: "erro", erro: r.error });
      continue;
    }
    try {
      itens.push({ indice, ...(await ingestOne(r.event, isDemo)) });
    } catch (err) {
      // Dois envios iguais ao mesmo tempo: o segundo bate na chave única e vira "repetido".
      if ((err as { code?: string }).code === "P2002") itens.push({ indice, status: "repetido" });
      else {
        console.error("Fonte de vendas:", err);
        itens.push({ indice, status: "erro", erro: "Erro interno ao gravar." });
      }
    }
  }
  return { ok: true as const, itens };
}

/** Resumo para a tela "Fonte de vendas". */
export async function salesSourceOverview(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [leads, leadsMeta, sales, revenue, lastLead, lastSale] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: since } } }),
    prisma.lead.count({ where: { createdAt: { gte: since }, OR: [{ fbclid: { not: null } }, { campaignExternalId: { not: null } }] } }),
    prisma.sale.count({ where: { paidAt: { gte: since }, first: true } }),
    prisma.sale.aggregate({ where: { paidAt: { gte: since } }, _sum: { amount: true } }),
    prisma.lead.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    prisma.sale.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
  ]);
  return {
    leads,
    leadsMeta,
    sales,
    revenue: revenue._sum.amount ?? 0,
    lastReceivedAt:
      [lastLead?.receivedAt, lastSale?.receivedAt].filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0] ?? null,
  };
}
