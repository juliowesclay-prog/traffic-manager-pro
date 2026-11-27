/**
 * Gestor de Tráfego IA — IA analista (entrega 8.5). Regras puras: o que vai para a IA (só números
 * agregados, nunca dados de clientes) e as travas aplicadas à resposta antes de mostrar na tela.
 * A IA só sugere; nenhuma sugestão é executada (ações com aprovação ficam para a 8.6).
 */

export const AI_SUGGESTION_TYPES = [
  "pausar_anuncio",
  "pausar_campanha",
  "reativar",
  "reduzir_orcamento",
  "aumentar_orcamento",
  "trocar_criativo",
  "ajustar_publico",
  "ajustar_parametros_url",
  "manter",
  "investigar",
] as const;
export type AiSuggestionType = (typeof AI_SUGGESTION_TYPES)[number];

export const AI_SUGGESTION_LABELS: Record<AiSuggestionType, string> = {
  pausar_anuncio: "Pausar anúncio",
  pausar_campanha: "Pausar campanha",
  reativar: "Reativar",
  reduzir_orcamento: "Reduzir orçamento",
  aumentar_orcamento: "Aumentar orçamento",
  trocar_criativo: "Trocar imagem ou texto",
  ajustar_publico: "Ajustar público",
  ajustar_parametros_url: "Configurar parâmetros de URL",
  manter: "Manter como está",
  investigar: "Investigar",
};

/** Sugestões que, se feitas, podem aumentar o gasto na Meta. */
export const AI_SPEND_INCREASING: readonly AiSuggestionType[] = ["aumentar_orcamento", "reativar"];
/** Sugestões que precisam apontar uma campanha ou anúncio existente. */
const NEEDS_TARGET: readonly AiSuggestionType[] = [
  "pausar_anuncio",
  "pausar_campanha",
  "reativar",
  "reduzir_orcamento",
  "aumentar_orcamento",
  "trocar_criativo",
  "ajustar_publico",
];
export const AI_CONFIDENCE = ["baixa", "media", "alta"] as const;
export type AiConfidence = (typeof AI_CONFIDENCE)[number];

/** Limites de uso (custo e abuso). */
export const AI_LIMITS = {
  perUserPerHour: 5,
  perAccountPerDay: 30,
  /** Abaixo disso, a confiança de mudanças de orçamento é rebaixada. */
  minSalesForBudgetAdvice: 5,
  /** Quantos anúncios (os de maior gasto) vão para a IA. */
  maxAds: 25,
  /** Análise presa em "executando" é liberada depois deste tempo. */
  staleMinutes: 5,
};

// ─── Entrada ─────────────────────────────────────────────────────────

export interface AiTotals {
  investido: number;
  cadastros: number;
  vendas: number;
  receita: number;
  cac: number | null;
  retorno: number | null;
  impressoes: number;
  cliques_no_link: number;
  ctr_pct: number | null;
}

export interface AiAnalysisInput {
  periodo: { dias: number; de: string; ate: string };
  moeda: "BRL";
  produto: string;
  totais: AiTotals;
  periodo_anterior: AiTotals;
  campanhas: {
    id: string;
    nome: string;
    situacao: string;
    objetivo: string;
    orcamento_diario: number | null;
    orcamento_total: number | null;
    orcamento_restante: number | null;
    investido: number;
    cadastros: number;
    vendas: number;
    receita: number;
    cac: number | null;
  }[];
  anuncios: {
    id: string;
    nome: string;
    campanha_id: string;
    situacao: string;
    titulo: string | null;
    investido: number;
    impressoes: number;
    cliques_no_link: number;
    ctr_pct: number | null;
    vendas: number;
    cac: number | null;
  }[];
  serie_diaria: { dia: string; investido: number; vendas: number }[];
  alertas: { nivel: string; titulo: string; detalhe: string }[];
  cadastros_meta_sem_identificacao: number;
  vendas_sem_origem: number;
}

/** Centavos → reais com 2 casas (número, para a IA ler sem formatação). */
export const reais = (cents: number | null) => (cents == null ? null : Math.round(cents) / 100);

/** Corta textos vindos da Meta (nomes, títulos) e tira quebras de linha e caracteres de controle. */
export function cleanText(s: string | null | undefined, max = 120): string {
  return Array.from(s ?? "", (ch) => {
    const c = ch.charCodeAt(0);
    return c < 32 || c === 127 ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ─── Saída e travas ──────────────────────────────────────────────────

export interface AiSuggestion {
  titulo: string;
  tipo: AiSuggestionType;
  alvo_id: string | null;
  porque: string;
  impacto_esperado: string;
  confianca: AiConfidence;
  prioridade: 1 | 2 | 3;
}

export interface AiAnalysisOutput {
  resumo: string;
  diagnostico: { titulo: string; explicacao: string; evidencias: string[] }[];
  sugestoes: AiSuggestion[];
  limitacoes: string[];
}

export interface ReviewedSuggestion extends AiSuggestion {
  alvo_nome: string | null;
  aumenta_gasto: boolean;
}

export interface ReviewedAnalysis {
  resumo: string;
  diagnostico: AiAnalysisOutput["diagnostico"];
  sugestoes: ReviewedSuggestion[];
  limitacoes: string[];
  /** Sugestões descartadas pelas travas (com o motivo), para transparência. */
  descartadas: { titulo: string; motivo: string }[];
}

const CONF_ORDER: Record<AiConfidence, number> = { baixa: 0, media: 1, alta: 2 };

/**
 * Travas aplicadas à resposta da IA:
 * - alvo inexistente (campanha/anúncio que não estava nos dados) → sugestão descartada;
 * - sugestão que aumenta gasto → marcada (só com aprovação e teto, 8.6);
 * - poucas vendas → confiança de mudanças de orçamento rebaixada para "baixa";
 * - textos cortados em tamanhos seguros; no máximo 5 diagnósticos e 6 sugestões.
 */
export function reviewAnalysis(out: AiAnalysisOutput, input: AiAnalysisInput): ReviewedAnalysis {
  const names = new Map<string, string>([
    ...input.campanhas.map((c) => [c.id, c.nome] as const),
    ...input.anuncios.map((a) => [a.id, a.nome] as const),
  ]);
  const descartadas: ReviewedAnalysis["descartadas"] = [];
  const limitacoes = out.limitacoes
    .map((l) => cleanText(l, 300))
    .filter(Boolean)
    .slice(0, 5);
  const fewSales = input.totais.vendas < AI_LIMITS.minSalesForBudgetAdvice;
  let downgraded = false;

  const sugestoes: ReviewedSuggestion[] = [];
  for (const s of out.sugestoes) {
    if (!AI_SUGGESTION_TYPES.includes(s.tipo)) {
      descartadas.push({ titulo: cleanText(s.titulo), motivo: "tipo de sugestão desconhecido" });
      continue;
    }
    const target = s.alvo_id ? cleanText(s.alvo_id, 40) : null;
    if (target && !names.has(target)) {
      descartadas.push({
        titulo: cleanText(s.titulo),
        motivo: "cita campanha ou anúncio que não existe nos dados",
      });
      continue;
    }
    if (!target && NEEDS_TARGET.includes(s.tipo)) {
      descartadas.push({ titulo: cleanText(s.titulo), motivo: "não diz qual campanha ou anúncio" });
      continue;
    }
    let confianca: AiConfidence = AI_CONFIDENCE.includes(s.confianca) ? s.confianca : "baixa";
    const budget = s.tipo === "aumentar_orcamento" || s.tipo === "reduzir_orcamento";
    if (budget && fewSales && CONF_ORDER[confianca] > 0) {
      confianca = "baixa";
      downgraded = true;
    }
    sugestoes.push({
      titulo: cleanText(s.titulo, 140),
      tipo: s.tipo,
      alvo_id: target,
      alvo_nome: target ? (names.get(target) ?? null) : null,
      porque: cleanText(s.porque, 600),
      impacto_esperado: cleanText(s.impacto_esperado, 300),
      confianca,
      prioridade: ([1, 2, 3] as const).includes(s.prioridade) ? s.prioridade : 3,
      aumenta_gasto: AI_SPEND_INCREASING.includes(s.tipo),
    });
  }
  if (downgraded)
    limitacoes.push(
      `Menos de ${AI_LIMITS.minSalesForBudgetAdvice} vendas no período: mudanças de orçamento ficaram com confiança baixa.`,
    );

  return {
    resumo: cleanText(out.resumo, 900),
    diagnostico: out.diagnostico.slice(0, 5).map((d) => ({
      titulo: cleanText(d.titulo, 140),
      explicacao: cleanText(d.explicacao, 700),
      evidencias: d.evidencias
        .map((e) => cleanText(e, 200))
        .filter(Boolean)
        .slice(0, 5),
    })),
    sugestoes: sugestoes.sort((a, b) => a.prioridade - b.prioridade).slice(0, 6),
    limitacoes,
    descartadas,
  };
}
