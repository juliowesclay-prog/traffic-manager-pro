/**
 * Desempenho dos criativos (Etapa 7): soma os números dos anúncios ligados a cada criativo,
 * calcula as taxas e escreve uma leitura objetiva — sempre citando o período. Funções puras.
 */
import { formatBRL } from "./money";
import type { CreativeKind } from "./marketing";

export interface AdNumbers {
  spend: number; // centavos
  impressions: number;
  linkClicks: number;
  leads: number;
  purchases: number;
  /** Vendas reais (fonte de vendas) e receita em centavos. */
  sales: number;
  revenue: number;
}

export const EMPTY_NUMBERS: AdNumbers = {
  spend: 0,
  impressions: 0,
  linkClicks: 0,
  leads: 0,
  purchases: 0,
  sales: 0,
  revenue: 0,
};

export function addNumbers(a: AdNumbers, b: Partial<AdNumbers>): AdNumbers {
  return {
    spend: a.spend + (b.spend ?? 0),
    impressions: a.impressions + (b.impressions ?? 0),
    linkClicks: a.linkClicks + (b.linkClicks ?? 0),
    leads: a.leads + (b.leads ?? 0),
    purchases: a.purchases + (b.purchases ?? 0),
    sales: a.sales + (b.sales ?? 0),
    revenue: a.revenue + (b.revenue ?? 0),
  };
}

export interface Rates {
  /** CTR em % (cliques no link ÷ impressões). */
  ctr: number | null;
  /** Custo por clique no link (centavos). */
  cpc: number | null;
  /** Custo por cadastro/lead (centavos). */
  cpl: number | null;
  /** Custo por venda real (centavos). */
  cac: number | null;
  /** Receita ÷ investido. */
  roas: number | null;
}

export function rates(n: AdNumbers): Rates {
  return {
    ctr: n.impressions > 0 ? Math.round((n.linkClicks / n.impressions) * 10_000) / 100 : null,
    cpc: n.linkClicks > 0 ? Math.round(n.spend / n.linkClicks) : null,
    cpl: n.leads > 0 ? Math.round(n.spend / n.leads) : null,
    cac: n.sales > 0 ? Math.round(n.spend / n.sales) : null,
    roas: n.spend > 0 && n.revenue > 0 ? Math.round((n.revenue / n.spend) * 100) / 100 : null,
  };
}

export interface CreativePerf {
  id: string;
  name: string;
  kind: CreativeKind;
  ads: number;
  numbers: AdNumbers;
}

/** Ordena: mais vendas reais, depois menor custo por venda, depois mais leads, depois mais gasto. */
export function rankCreatives<T extends CreativePerf>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ra = rates(a.numbers);
    const rb = rates(b.numbers);
    return (
      b.numbers.sales - a.numbers.sales ||
      (ra.cac ?? Infinity) - (rb.cac ?? Infinity) ||
      b.numbers.leads - a.numbers.leads ||
      b.numbers.spend - a.numbers.spend
    );
  });
}

const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);

/** Leitura em frases curtas, só com fatos dos números (sem previsões). */
export function performanceReading(list: CreativePerf[], periodLabel: string): string[] {
  const active = list.filter((c) => c.numbers.spend > 0 || c.numbers.impressions > 0);
  if (!active.length) return [`Nenhum criativo vinculado teve entrega ${periodLabel}.`];
  const total = active.reduce((a, c) => addNumbers(a, c.numbers), EMPTY_NUMBERS);
  const out: string[] = [
    `${periodLabel}, ${active.length} criativo(s) com entrega somaram ${formatBRL(total.spend)} investidos, ${total.leads} cadastro(s) e ${total.sales} venda(s) real(is).`,
  ];
  const ranked = rankCreatives(active);
  const best = ranked[0]!;
  const br = rates(best.numbers);
  if (best.numbers.sales > 0)
    out.push(
      `O criativo com melhor resultado foi “${best.name}”: ${best.numbers.sales} venda(s) real(is), custo por venda de ${formatBRL(br.cac!)}.`,
    );
  else if (best.numbers.leads > 0)
    out.push(
      `Nenhum criativo trouxe venda registrada; o que mais gerou cadastros foi “${best.name}” (${best.numbers.leads}, ${formatBRL(br.cpl!)} cada).`,
    );
  const byCtr = [...active]
    .filter((c) => c.numbers.impressions >= 1000)
    .sort((a, b) => (rates(b.numbers).ctr ?? 0) - (rates(a.numbers).ctr ?? 0));
  if (byCtr.length >= 2)
    out.push(
      `Maior taxa de cliques: “${byCtr[0]!.name}” (${pct(rates(byCtr[0]!.numbers).ctr)}); menor: “${byCtr.at(-1)!.name}” (${pct(rates(byCtr.at(-1)!.numbers).ctr)}).`,
    );
  const wasted = active.filter(
    (c) => c.numbers.spend >= 5000 && c.numbers.sales === 0 && c.numbers.leads === 0,
  );
  for (const w of wasted.slice(0, 3))
    out.push(
      `“${w.name}” gastou ${formatBRL(w.numbers.spend)} sem cadastro nem venda: vale revisar ou pausar.`,
    );
  return out;
}

/** Soma por tipo (imagem, carrossel, vídeo). */
export function byKind(
  list: CreativePerf[],
): { kind: CreativeKind; creatives: number; numbers: AdNumbers }[] {
  const m = new Map<CreativeKind, { creatives: number; numbers: AdNumbers }>();
  for (const c of list) {
    const cur = m.get(c.kind) ?? { creatives: 0, numbers: EMPTY_NUMBERS };
    m.set(c.kind, { creatives: cur.creatives + 1, numbers: addNumbers(cur.numbers, c.numbers) });
  }
  return [...m.entries()].map(([kind, v]) => ({ kind, ...v }));
}
