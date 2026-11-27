import "server-only";
import { AnalystError, type TrafficAnalyst } from "./analyst";
import { claudeAnalyst } from "./claude";
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

export { AnalystError };
