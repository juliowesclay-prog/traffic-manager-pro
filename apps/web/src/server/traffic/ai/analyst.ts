import "server-only";
import { z } from "zod";
import {
  AI_CONFIDENCE,
  AI_SUGGESTION_TYPES,
  type AiAnalysisInput,
  type AiAnalysisOutput,
} from "@prosed/core";

/** Analista de tráfego: recebe só números agregados e devolve diagnóstico e sugestões. */
export interface TrafficAnalyst {
  name: "claude" | "simulado";
  model: string;
  analyze(input: AiAnalysisInput): Promise<{
    output: AiAnalysisOutput;
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
}

/** Erro com mensagem segura para a tela (`message`) e detalhe técnico só para o log (`detail`). */
export class AnalystError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "AnalystError";
  }
}

/** Formato exigido da resposta (o Claude responde já neste formato — saída estruturada). */
export const analysisSchema = z.object({
  resumo: z.string().describe("Visão geral em 2 a 4 frases, com os números principais."),
  diagnostico: z
    .array(
      z.object({
        titulo: z.string(),
        explicacao: z.string(),
        evidencias: z.array(z.string()).describe("Números dos dados que sustentam o diagnóstico."),
      }),
    )
    .describe("Até 5 pontos, do mais importante ao menos importante."),
  sugestoes: z
    .array(
      z.object({
        titulo: z.string(),
        tipo: z.enum(AI_SUGGESTION_TYPES),
        alvo_id: z
          .string()
          .nullable()
          .describe("id exato de uma campanha ou anúncio dos dados; null se a sugestão for geral."),
        porque: z.string(),
        impacto_esperado: z.string(),
        confianca: z.enum(AI_CONFIDENCE),
        prioridade: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
    )
    .describe("Até 6 sugestões. Prioridade 1 = fazer primeiro."),
  limitacoes: z.array(z.string()).describe("O que os dados não permitem concluir."),
});
