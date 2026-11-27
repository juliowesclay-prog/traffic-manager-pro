/**
 * Gestor de Tráfego IA — alertas do painel (entrega 8.4). Regras puras e explicáveis: cada alerta diz
 * o que aconteceu, com os números, e o que conferir. Nenhum alerta faz ação na Meta.
 */

export type AlertLevel = "alta" | "media" | "info";

export interface TrafficAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  /** Campanha ou anúncio ligado ao alerta (para o link na tela). */
  objectId?: string;
}

export interface AlertItem {
  id: string;
  name: string;
  spend: number;
  sales: number;
  impressions: number;
  linkClicks: number;
}

export interface AlertCampaign extends AlertItem {
  effectiveStatus: string;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
  /** Gasto e vendas da semana anterior (para "CAC subindo"). */
  prevSpend: number;
  prevSales: number;
}

export interface AlertInput {
  campaigns: AlertCampaign[];
  ads: (AlertItem & { effectiveStatus: string })[];
  /** CAC médio do período (centavos) ou null sem vendas. */
  averageCac: number | null;
  /** Minutos desde a última atualização completa (null = nunca). */
  minutesSinceSync: number | null;
  syncIntervalMinutes: number;
  tokenDaysLeft: number | null;
  withoutIds: number;
  formatMoney: (cents: number) => string;
}

/** Limites (documentados no manual). */
export const ALERT_RULES = {
  /** Gasto mínimo para julgar "gastou e não vendeu": R$ 50 ou 2× o CAC médio, o que for maior. */
  minSpendNoSale: 5000,
  /** CAC desta semana acima de 1,5× o da semana anterior (com ao menos 2 vendas em cada). */
  cacRiseFactor: 1.5,
  minSalesForTrend: 2,
  /** Orçamento total com menos de 10% restante. */
  lowBudgetShare: 0.1,
  /** CTR abaixo de 0,5% com pelo menos 1.000 impressões. */
  lowCtrPct: 0.5,
  minImpressionsCtr: 1000,
  /** Dados parados há mais de 2× o intervalo (mínimo 3 h) ou 24 h com a automática desligada. */
  staleFactor: 2,
};

const PROBLEM = ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"];
const ORDER: Record<AlertLevel, number> = { alta: 0, media: 1, info: 2 };

export function trafficAlerts(i: AlertInput): TrafficAlert[] {
  const out: TrafficAlert[] = [];
  const m = i.formatMoney;
  const noSaleLimit = Math.max(ALERT_RULES.minSpendNoSale, 2 * (i.averageCac ?? 0));

  if (i.tokenDaysLeft != null && i.tokenDaysLeft < 7)
    out.push({
      id: "conexao",
      level: "alta",
      title:
        i.tokenDaysLeft <= 0
          ? "A conexão com a Meta venceu"
          : `A conexão com a Meta vence em ${i.tokenDaysLeft} dia(s)`,
      detail: "Conecte de novo na aba Conexão para continuar recebendo os números.",
    });

  if (i.minutesSinceSync == null)
    out.push({
      id: "sem-dados",
      level: "media",
      title: "Os anúncios ainda não foram atualizados",
      detail: "Clique em Atualizar agora na aba Campanhas.",
    });
  else {
    const limit =
      i.syncIntervalMinutes > 0 ? Math.max(180, i.syncIntervalMinutes * ALERT_RULES.staleFactor) : 1440;
    if (i.minutesSinceSync > limit)
      out.push({
        id: "dados-parados",
        level: "media",
        title: "Os números estão desatualizados",
        detail: `A última atualização completa foi há ${Math.round(i.minutesSinceSync / 60)} hora(s). Confira a aba Campanhas.`,
      });
  }

  for (const a of i.ads)
    if (PROBLEM.includes(a.effectiveStatus))
      out.push({
        id: `problema-${a.id}`,
        level: "alta",
        objectId: a.id,
        title: `Anúncio com problema na Meta: ${a.name}`,
        detail:
          a.effectiveStatus === "DISAPPROVED"
            ? "Reprovado pela Meta: não está sendo veiculado."
            : "A Meta aponta um problema (pagamento ou entrega). Confira no Gerenciador de Anúncios.",
      });

  for (const c of i.campaigns) {
    if (c.spend >= noSaleLimit && c.sales === 0)
      out.push({
        id: `sem-venda-${c.id}`,
        level: "alta",
        objectId: c.id,
        title: `Gastou ${m(c.spend)} sem nenhuma venda: ${c.name}`,
        detail:
          "Nenhuma assinatura paga veio desta campanha no período. Avalie pausar ou trocar o público e o anúncio.",
      });
    if (
      c.sales >= ALERT_RULES.minSalesForTrend &&
      c.prevSales >= ALERT_RULES.minSalesForTrend &&
      c.spend / c.sales > ALERT_RULES.cacRiseFactor * (c.prevSpend / c.prevSales)
    )
      out.push({
        id: `cac-subindo-${c.id}`,
        level: "media",
        objectId: c.id,
        title: `Custo por venda subindo: ${c.name}`,
        detail: `CAC dos últimos 7 dias ${m(Math.round(c.spend / c.sales))}, contra ${m(Math.round(c.prevSpend / c.prevSales))} na semana anterior.`,
      });
    if (
      c.effectiveStatus === "ACTIVE" &&
      c.lifetimeBudget &&
      c.budgetRemaining != null &&
      c.budgetRemaining < c.lifetimeBudget * ALERT_RULES.lowBudgetShare
    )
      out.push({
        id: `orcamento-${c.id}`,
        level: "media",
        objectId: c.id,
        title: `Orçamento quase no fim: ${c.name}`,
        detail: `Restam ${m(c.budgetRemaining)} de ${m(c.lifetimeBudget)}. Quando acabar, a campanha para. Aumentar exige aprovação.`,
      });
  }

  for (const a of i.ads) {
    if (a.spend >= noSaleLimit && a.sales === 0 && !out.some((x) => x.id === `problema-${a.id}`))
      out.push({
        id: `anuncio-sem-venda-${a.id}`,
        level: "media",
        objectId: a.id,
        title: `Anúncio gastou ${m(a.spend)} sem venda: ${a.name}`,
        detail: "Compare com os anúncios que vendem no ranking abaixo.",
      });
    if (
      a.impressions >= ALERT_RULES.minImpressionsCtr &&
      (a.linkClicks / a.impressions) * 100 < ALERT_RULES.lowCtrPct
    )
      out.push({
        id: `ctr-${a.id}`,
        level: "info",
        objectId: a.id,
        title: `Poucos cliques: ${a.name}`,
        detail: `Só ${((a.linkClicks / a.impressions) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% de quem viu clicou. Teste outra imagem ou texto.`,
      });
  }

  if (i.withoutIds > 0)
    out.push({
      id: "sem-identificacao",
      level: "info",
      title: `${i.withoutIds} cadastro(s) da Meta sem identificação do anúncio`,
      detail: "Configure os parâmetros de URL nos anúncios (aba Vendas por anúncio).",
    });

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Variação em % entre dois períodos (uma casa); sem base → null. */
export function periodChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
