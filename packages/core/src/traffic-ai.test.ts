import { describe, expect, it } from "vitest";
import {
  cleanText,
  reais,
  reviewAnalysis,
  type AiAnalysisInput,
  type AiAnalysisOutput,
  type AiSuggestion,
} from "./traffic-ai";

const totals = {
  investido: 100,
  cadastros: 10,
  vendas: 8,
  receita: 300,
  cac: 12.5,
  retorno: 3,
  impressoes: 1000,
  cliques_no_link: 20,
  ctr_pct: 2,
};
const input = (p: Partial<AiAnalysisInput> = {}): AiAnalysisInput => ({
  periodo: { dias: 7, de: "2026-11-20", ate: "2026-11-26" },
  moeda: "BRL",
  produto: "Cartão do Trabalhador",
  totais: totals,
  periodo_anterior: totals,
  campanhas: [
    {
      id: "c1",
      nome: "Vendas",
      situacao: "ACTIVE",
      objetivo: "Vendas",
      orcamento_diario: 50,
      orcamento_total: null,
      orcamento_restante: null,
      investido: 100,
      cadastros: 10,
      vendas: 8,
      receita: 300,
      cac: 12.5,
    },
  ],
  anuncios: [
    {
      id: "a1",
      nome: "Vídeo",
      campanha_id: "c1",
      situacao: "ACTIVE",
      titulo: null,
      investido: 100,
      impressoes: 1000,
      cliques_no_link: 20,
      ctr_pct: 2,
      vendas: 8,
      cac: 12.5,
    },
  ],
  serie_diaria: [],
  alertas: [],
  cadastros_meta_sem_identificacao: 0,
  vendas_sem_origem: 0,
  ...p,
});
const sug = (p: Partial<AiSuggestion>): AiSuggestion => ({
  titulo: "Sugestão",
  tipo: "manter",
  alvo_id: null,
  porque: "porque sim",
  impacto_esperado: "nenhum",
  confianca: "alta",
  prioridade: 2,
  ...p,
});
const out = (s: AiSuggestion[]): AiAnalysisOutput => ({
  resumo: "ok",
  diagnostico: [],
  sugestoes: s,
  limitacoes: [],
});

describe("IA analista: travas da resposta", () => {
  it("descarta alvo inventado e sugestão de ação sem alvo", () => {
    const r = reviewAnalysis(
      out([
        sug({ tipo: "pausar_anuncio", alvo_id: "a999" }),
        sug({ tipo: "pausar_campanha", alvo_id: null }),
        sug({ tipo: "pausar_anuncio", alvo_id: "a1" }),
      ]),
      input(),
    );
    expect(r.sugestoes.map((s) => s.alvo_id)).toEqual(["a1"]);
    expect(r.sugestoes[0]!.alvo_nome).toBe("Vídeo");
    expect(r.descartadas.map((d) => d.motivo)).toEqual([
      "cita campanha ou anúncio que não existe nos dados",
      "não diz qual campanha ou anúncio",
    ]);
  });

  it("marca o que aumenta gasto", () => {
    const r = reviewAnalysis(
      out([
        sug({ tipo: "aumentar_orcamento", alvo_id: "c1" }),
        sug({ tipo: "reduzir_orcamento", alvo_id: "c1" }),
      ]),
      input(),
    );
    expect(r.sugestoes.map((s) => s.aumenta_gasto)).toEqual([true, false]);
  });

  it("com poucas vendas, mudança de orçamento fica com confiança baixa e avisa", () => {
    const r = reviewAnalysis(
      out([
        sug({ tipo: "aumentar_orcamento", alvo_id: "c1" }),
        sug({ tipo: "trocar_criativo", alvo_id: "a1" }),
      ]),
      input({ totais: { ...totals, vendas: 2 } }),
    );
    expect(r.sugestoes.map((s) => s.confianca)).toEqual(["baixa", "alta"]);
    expect(r.limitacoes.join(" ")).toContain("confiança baixa");
  });

  it("ordena por prioridade, limita a 6 e limpa textos", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      sug({ titulo: `S${i}\n\nlinha`, prioridade: ((i % 3) + 1) as 1 | 2 | 3 }),
    );
    const r = reviewAnalysis(out(many), input());
    expect(r.sugestoes).toHaveLength(6);
    expect(r.sugestoes.map((s) => s.prioridade)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(r.sugestoes[0]!.titulo).toBe("S0 linha");
  });

  it("utilitários", () => {
    expect(reais(12345)).toBe(123.45);
    expect(reais(null)).toBeNull();
    expect(cleanText("a\u0007b\n c", 10)).toBe("a b c");
    expect(cleanText("x".repeat(200)).length).toBe(120);
  });
});
