import "server-only";
import type { AiAnalysisInput, AiAnalysisOutput, AiSuggestion } from "@tmp/core";
import { prisma } from "@/server/db";
import { AnalystError, type TrafficAnalyst } from "./analyst";

/**
 * Analista SIMULADO (só desenvolvimento/testes): regras fixas sobre os mesmos dados que iriam para a IA.
 * Sempre marcado como DEMO. Falhas podem ser forçadas pela Setting `simulado.ia.falha` ("erro" | "alvo_inventado").
 */

const brl = (v: number | null) =>
  v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const simulatedAnalyst: TrafficAnalyst = {
  name: "simulado",
  model: "simulado-regras-v1",
  async analyze(input: AiAnalysisInput) {
    if (process.env.APP_ENV === "production")
      throw new AnalystError("A IA simulada não pode ser usada em produção.");
    const fail = await prisma.setting.findUnique({ where: { key: "simulado.ia.falha" } });
    if (fail?.value === "erro")
      throw new AnalystError("A IA não respondeu. Tente de novo em alguns minutos.", "simulado");

    const t = input.totais;
    const p = input.periodo_anterior;
    const best = [...input.anuncios].filter((a) => a.vendas > 0).sort((a, b) => b.vendas - a.vendas)[0];
    const worst = [...input.anuncios]
      .filter((a) => a.vendas === 0)
      .sort((a, b) => b.investido - a.investido)[0];
    const lowCtr = input.anuncios.find((a) => a.impressoes >= 1000 && (a.ctr_pct ?? 100) < 1);

    const diagnostico: AiAnalysisOutput["diagnostico"] = [
      {
        titulo: t.vendas > 0 ? "Os anúncios estão gerando vendas" : "Nenhuma venda vinda dos anúncios",
        explicacao: `Em ${input.periodo.dias} dias foram investidos ${brl(t.investido)} e vieram ${t.vendas} venda(s). No período anterior: ${brl(p.investido)} e ${p.vendas} venda(s).`,
        evidencias: [`Investido: ${brl(t.investido)}`, `Vendas: ${t.vendas}`, `CAC: ${brl(t.cac)}`],
      },
    ];
    if (worst)
      diagnostico.push({
        titulo: "Há anúncio gastando sem vender",
        explicacao: `"${worst.nome}" investiu ${brl(worst.investido)} sem nenhuma venda no período.`,
        evidencias: [`${worst.nome}: ${brl(worst.investido)}, 0 venda`],
      });

    const sugestoes: AiSuggestion[] = [];
    if (worst)
      sugestoes.push({
        titulo: `Pausar "${worst.nome}" ou trocar a imagem`,
        tipo: "pausar_anuncio",
        alvo_id: worst.id,
        porque: `Gastou ${brl(worst.investido)} sem nenhuma venda.`,
        impacto_esperado: `Economizar cerca de ${brl(worst.investido / input.periodo.dias)} por dia.`,
        confianca: worst.investido >= 50 ? "media" : "baixa",
        prioridade: 1,
      });
    if (best)
      sugestoes.push({
        titulo: `Aumentar aos poucos o investimento na campanha de "${best.nome}"`,
        tipo: "aumentar_orcamento",
        alvo_id: best.campanha_id,
        porque: `"${best.nome}" trouxe ${best.vendas} venda(s) com CAC de ${brl(best.cac)}.`,
        impacto_esperado: "Mais vendas mantendo o CAC, se o público ainda não estiver saturado.",
        confianca: "alta",
        prioridade: 2,
      });
    if (lowCtr)
      sugestoes.push({
        titulo: `Testar outra imagem em "${lowCtr.nome}"`,
        tipo: "trocar_criativo",
        alvo_id: lowCtr.id,
        porque: `Só ${lowCtr.ctr_pct?.toLocaleString("pt-BR")}% de quem viu clicou.`,
        impacto_esperado: "Mais cliques pelo mesmo valor.",
        confianca: "media",
        prioridade: 3,
      });
    if (input.cadastros_meta_sem_identificacao > 0)
      sugestoes.push({
        titulo: "Configurar os parâmetros de URL nos anúncios",
        tipo: "ajustar_parametros_url",
        alvo_id: null,
        porque: `${input.cadastros_meta_sem_identificacao} cadastro(s) vieram da Meta sem identificar o anúncio.`,
        impacto_esperado: "Saber exatamente qual anúncio vende.",
        confianca: "alta",
        prioridade: 2,
      });
    if (fail?.value === "alvo_inventado")
      sugestoes.push({
        titulo: "Pausar anúncio que não existe",
        tipo: "pausar_anuncio",
        alvo_id: "999999999999999",
        porque: "teste da trava",
        impacto_esperado: "nenhum",
        confianca: "alta",
        prioridade: 1,
      });
    if (!sugestoes.length)
      sugestoes.push({
        titulo: "Manter como está e acompanhar",
        tipo: "manter",
        alvo_id: null,
        porque: "Nenhum sinal claro de problema no período.",
        impacto_esperado: "—",
        confianca: "media",
        prioridade: 3,
      });

    return {
      output: {
        resumo: `DEMO — análise simulada por regras fixas (não é a IA). ${input.periodo.dias} dias: ${brl(t.investido)} investidos, ${t.vendas} venda(s), CAC ${brl(t.cac)}.`,
        diagnostico,
        sugestoes,
        limitacoes: ["Análise simulada para testes: os números são DEMO."],
      },
      inputTokens: null,
      outputTokens: null,
    };
  },
};
