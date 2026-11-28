import "server-only";
import { z } from "zod";
import type { AiAnalysisInput } from "@tmp/core";
import { analysisSchema, AnalystError, type TrafficAnalyst } from "./analyst";
import { ANALYST_SYSTEM } from "./claude";

/**
 * Analista com a chave do ChatGPT (OpenAI) da própria empresa. Mesmo texto de instruções e o mesmo
 * formato de resposta do Claude (saída estruturada, conferida de novo aqui). Só números agregados.
 */

const API = "https://api.openai.com/v1";

/** JSON Schema no modo estrito da OpenAI: todo objeto fecha propriedades extras e exige todas. */
function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== "object") return node;
  const o = Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([k]) => k !== "$schema")
      .map(([k, v]) => [k, strictSchema(v)]),
  );
  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    o.additionalProperties = false;
    o.required = Object.keys(o.properties);
  }
  return o;
}
const SCHEMA = strictSchema(z.toJSONSchema(analysisSchema));

async function call<T>(apiKey: string, path: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AnalystError("Não foi possível falar com o ChatGPT. Tente de novo.", String(e));
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } };
  if (res.status === 401 || res.status === 403)
    throw new AnalystError(
      "O ChatGPT recusou a chave. Confira se copiou a chave inteira e se ela está ativa.",
      j.error?.message,
    );
  if (res.status === 429)
    throw new AnalystError(
      j.error?.code === "insufficient_quota"
        ? "A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com."
        : "O ChatGPT está com muitos pedidos agora. Tente em alguns minutos.",
      j.error?.message,
    );
  if (!res.ok)
    throw new AnalystError(
      "O ChatGPT não aceitou o pedido. Tente de novo.",
      `${res.status} ${j.error?.message ?? ""}`,
    );
  return j;
}

export async function openaiModels(apiKey: string): Promise<string[]> {
  const j = await call<{ data?: { id: string }[] }>(apiKey, "/models");
  return (j.data ?? []).map((m) => m.id);
}

export const openaiAnalystWith = (apiKey: string, model: string): TrafficAnalyst => ({
  name: "openai",
  model,
  async analyze(input: AiAnalysisInput) {
    const j = await call<{
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>(
      apiKey,
      "/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: ANALYST_SYSTEM },
            {
              role: "user",
              content: `Dados dos anúncios (JSON). Analise e responda no formato pedido.\n\n${JSON.stringify(input)}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "analise", strict: true, schema: SCHEMA },
          },
        }),
      },
      180_000,
    );
    const c = j.choices?.[0];
    if (c?.message?.refusal) throw new AnalystError("A IA recusou esta análise.", c.message.refusal);
    if (c?.finish_reason === "length")
      throw new AnalystError("A resposta da IA ficou incompleta. Tente de novo.", "length");
    let parsed;
    try {
      parsed = analysisSchema.parse(JSON.parse(c?.message?.content ?? ""));
    } catch {
      throw new AnalystError("A IA respondeu fora do formato. Tente de novo.", "parse");
    }
    return {
      output: parsed,
      inputTokens: j.usage?.prompt_tokens ?? null,
      outputTokens: j.usage?.completion_tokens ?? null,
    };
  },
});
