import "server-only";
import { companyAiKey } from "@/server/ai-credentials";
import { AnalystError, type TrafficAnalyst } from "./analyst";
import { claudeAnalyst, claudeAnalystWith } from "./claude";
import { openaiAnalystWith } from "./openai";
import { simulatedAnalyst } from "./simulated";

/** AI_PROVIDER: "claude" (com ANTHROPIC_API_KEY) ou "simulado" (só fora de produção). Sem valor = desligada. */
export function aiProviderName(): "claude" | "simulado" | null {
  const v = process.env.AI_PROVIDER;
  if (v === "claude" && process.env.ANTHROPIC_API_KEY) return "claude";
  if (v === "simulado" && process.env.APP_ENV !== "production") return "simulado";
  return null;
}

export function activeAnalyst(): TrafficAnalyst {
  const name = aiProviderName();
  if (name === "claude") return claudeAnalyst;
  if (name === "simulado") return simulatedAnalyst;
  throw new AnalystError(
    "A IA analista ainda não foi configurada.",
    `AI_PROVIDER=${process.env.AI_PROVIDER}`,
  );
}

export type AnalystSource = "empresa" | "plataforma";

/**
 * Analista da empresa aberta: a chave da própria empresa (Claude ou ChatGPT) tem prioridade;
 * sem ela, a IA da plataforma. null = nenhuma IA disponível.
 */
export async function resolveAnalyst(): Promise<{
  analyst: TrafficAnalyst;
  source: AnalystSource;
  demo: boolean;
} | null> {
  const own = await companyAiKey();
  if (own) {
    // Modo de teste (nunca em produção): a chave DEMO usa as regras simuladas, com o nome do provedor.
    if (
      process.env.AI_KEY_TEST_MODE === "simulado" &&
      process.env.APP_ENV !== "production" &&
      own.key.endsWith("DEMOOK")
    )
      return {
        analyst: { ...simulatedAnalyst, name: own.provider, model: own.model },
        source: "empresa",
        demo: true,
      };
    const analyst =
      own.provider === "claude"
        ? claudeAnalystWith(own.key, own.model)
        : openaiAnalystWith(own.key, own.model);
    return { analyst, source: "empresa", demo: false };
  }
  const name = aiProviderName();
  if (!name) return null;
  return { analyst: activeAnalyst(), source: "plataforma", demo: name === "simulado" };
}

export { AnalystError };
