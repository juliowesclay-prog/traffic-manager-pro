import "server-only";
import {
  AI_LIMITS,
  cleanText,
  costPer,
  objectiveLabel,
  ratio,
  reais,
  reviewAnalysis,
  type AiAnalysisInput,
  type AiTotals,
  type ReviewedAnalysis,
} from "@tmp/core";
import { type Prisma } from "@tmp/db";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { currentCompanyId } from "@/server/tenant";
import { rateLimit } from "@/server/rate-limit";
import { trafficDashboard } from "../dashboard";
import { AnalystError, resolveAnalyst } from "./index";

/**
 * IA analista (entrega 8.5): monta o resumo dos dados (só números agregados), chama o analista,
 * aplica as travas e guarda tudo. Somente leitura na Meta: nenhuma sugestão é executada.
 */

export const AI_PERIODS = [7, 14, 30] as const;

type Totals = {
  spend: number;
  signups: number;
  sales: number;
  revenue: number;
  impressions: number;
  linkClicks: number;
};
const totals = (t: Totals): AiTotals => ({
  investido: reais(t.spend)!,
  cadastros: t.signups,
  vendas: t.sales,
  receita: reais(t.revenue)!,
  cac: reais(costPer(t.spend, t.sales)),
  retorno: t.spend > 0 ? Math.round((t.revenue / t.spend) * 100) / 100 : null,
  impressoes: t.impressions,
  cliques_no_link: t.linkClicks,
  ctr_pct: ratio(t.linkClicks, t.impressions),
});

/** O que vai para a IA. Sem nomes, telefones ou qualquer dado pessoal de cliente. */
export async function buildAnalysisInput(days: number, now = new Date()) {
  const d = await trafficDashboard(days, now);
  if (!d.account) return null;
  const accountId = (await prisma.metaAdAccount.findFirst({ where: { selected: true } }))?.accountId;
  // Contexto para a IA: só o nome da empresa (nenhum dado de cliente).
  const company = await prisma.company.findUnique({
    where: { id: await currentCompanyId() },
    select: { name: true },
  });
  const campaigns = await prisma.metaCampaign.findMany({ where: { accountId } });
  const rowOf = new Map(d.salesRows.map((r) => [r.key, r]));

  const input: AiAnalysisInput = {
    periodo: { dias: days, de: d.since, ate: d.until },
    moeda: "BRL",
    produto: company?.name ?? "empresa",
    totais: totals(d.current),
    periodo_anterior: totals(d.previous),
    campanhas: campaigns
      .map((c) => {
        const r = rowOf.get(`c:${c.externalId}`);
        return {
          id: c.externalId,
          nome: cleanText(c.name),
          situacao: c.effectiveStatus,
          objetivo: objectiveLabel(c.objective),
          orcamento_diario: reais(c.dailyBudget),
          orcamento_total: reais(c.lifetimeBudget),
          orcamento_restante: reais(c.budgetRemaining),
          investido: reais(r?.spend ?? 0)!,
          cadastros: r?.signups ?? 0,
          vendas: r?.sales ?? 0,
          receita: reais(r?.revenue ?? 0)!,
          cac: reais(costPer(r?.spend ?? 0, r?.sales ?? 0)),
        };
      })
      .filter((c) => c.investido > 0 || c.vendas > 0 || c.situacao === "ACTIVE"),
    anuncios: [...d.ads]
      .sort((a, b) => b.spend - a.spend || b.sales - a.sales)
      .slice(0, AI_LIMITS.maxAds)
      .map((a) => ({
        id: a.id,
        nome: cleanText(a.name),
        campanha_id: a.campaignId,
        situacao: a.effectiveStatus,
        titulo: a.title ? cleanText(a.title) : null,
        investido: reais(a.spend)!,
        impressoes: a.impressions,
        cliques_no_link: a.linkClicks,
        ctr_pct: ratio(a.linkClicks, a.impressions),
        vendas: a.sales,
        cac: reais(costPer(a.spend, a.sales)),
      })),
    serie_diaria: d.series.map((s) => ({ dia: s.day, investido: reais(s.spend)!, vendas: s.sales })),
    alertas: d.alerts.map((a) => ({ nivel: a.level, titulo: a.title, detalhe: a.detail })),
    cadastros_meta_sem_identificacao: d.withoutIds,
    vendas_sem_origem: rowOf.get("sem_origem")?.sales ?? 0,
  };
  return { input, accountId: accountId!, isDemo: d.account.isDemo, lastSync: d.lastSync };
}

export type AnalysisResult = { ok: true; id: string } | { ok: false; message: string };

export async function runAnalysis(userId: string, days: number): Promise<AnalysisResult> {
  if (!(AI_PERIODS as readonly number[]).includes(days)) return { ok: false, message: "Período inválido." };
  const resolved = await resolveAnalyst();
  if (!resolved) return { ok: false, message: "A IA analista ainda não foi configurada." };
  const built = await buildAnalysisInput(days);
  if (!built) return { ok: false, message: "Conecte a Meta e escolha a conta de anúncios primeiro." };
  if (!built.lastSync)
    return { ok: false, message: "Atualize os anúncios (aba Campanhas) antes de pedir a análise." };
  if (!(await rateLimit(`ia-analise:user:${userId}`, AI_LIMITS.perUserPerHour, 3600)))
    return { ok: false, message: "Muitas análises seguidas. Espere um pouco." };
  if (!(await rateLimit(`ia-analise:conta:${built.accountId}`, AI_LIMITS.perAccountPerDay, 86_400)))
    return { ok: false, message: "Limite diário de análises atingido. Tente amanhã." };

  // Libera análise presa (servidor reiniciado no meio).
  await prisma.trafficAnalysis.updateMany({
    where: {
      accountId: built.accountId,
      status: "EXECUTANDO",
      createdAt: { lt: new Date(Date.now() - AI_LIMITS.staleMinutes * 60_000) },
    },
    data: { status: "ERRO", error: "Interrompida.", finishedAt: new Date() },
  });

  const { analyst } = resolved;
  let row;
  try {
    row = await prisma.trafficAnalysis.create({
      data: {
        accountId: built.accountId,
        periodDays: days,
        provider: analyst.name,
        model: analyst.model,
        input: built.input as unknown as Prisma.InputJsonValue,
        isDemo: built.isDemo || resolved.demo,
        createdById: userId,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return { ok: false, message: "Já existe uma análise em andamento. Aguarde terminar." };
    throw e;
  }

  let reviewed: ReviewedAnalysis | null = null;
  let error: string | null = null;
  let usage: { inputTokens: number | null; outputTokens: number | null } = {
    inputTokens: null,
    outputTokens: null,
  };
  try {
    const r = await analyst.analyze(built.input);
    reviewed = reviewAnalysis(r.output, built.input);
    usage = { inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  } catch (e) {
    if (!(e instanceof AnalystError)) console.error("[ia-analista]", e);
    else if (e.detail) console.error("[ia-analista]", e.detail);
    error = e instanceof AnalystError ? e.message : "Erro inesperado na análise. Tente de novo.";
  }
  await prisma.trafficAnalysis.update({
    where: { id: row.id },
    data: {
      status: reviewed ? "OK" : "ERRO",
      output: reviewed ? (reviewed as unknown as Prisma.InputJsonValue) : undefined,
      error,
      ...usage,
      finishedAt: new Date(),
    },
  });
  await audit({
    actorId: userId,
    action: "traffic.ai_analysis",
    entity: "TrafficAnalysis",
    entityId: row.id,
    after: {
      periodo: days,
      provedor: analyst.name,
      modelo: analyst.model,
      ia: resolved.source,
      ...(reviewed
        ? { sugestoes: reviewed.sugestoes.length, descartadas: reviewed.descartadas.length }
        : { erro: error }),
    },
  });
  return reviewed ? { ok: true, id: row.id } : { ok: false, message: error! };
}

export async function listAnalyses(take = 10) {
  const account = await prisma.metaAdAccount.findFirst({ where: { selected: true } });
  if (!account) return [];
  return prisma.trafficAnalysis.findMany({
    where: { accountId: account.accountId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getAnalysis(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const account = await prisma.metaAdAccount.findFirst({ where: { selected: true } });
  if (!account) return null;
  return prisma.trafficAnalysis.findFirst({ where: { id, accountId: account.accountId } });
}
