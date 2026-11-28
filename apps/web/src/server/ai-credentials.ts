import "server-only";
import { AI_KEY_PROVIDERS, chatModels, parseAiKey, pickModel, type AiKeyProvider } from "@tmp/core";
import { decrypt, encrypt } from "@tmp/db";
import { audit } from "./audit";
import { prisma } from "./db";
import { rateLimit } from "./rate-limit";
import { AnalystError } from "./traffic/ai/analyst";
import { claudeModels } from "./traffic/ai/claude";
import { openaiModels } from "./traffic/ai/openai";

/**
 * IA do próprio cliente: cada empresa pode cadastrar a CHAVE DE API do Claude ou do ChatGPT.
 * A chave é testada antes de ser guardada, fica cifrada e nunca volta para a tela (só os 4 últimos
 * caracteres). Sem chave cadastrada, a empresa usa a IA da plataforma (se estiver ligada).
 * AI_KEY_TEST_MODE=simulado (só fora de produção): o teste não chama a internet — chaves que
 * terminam em "DEMOOK" passam, as outras são recusadas.
 */

export type AiKeyResult = { ok: true; message: string } | { ok: false; message: string };

const testMode = () => process.env.AI_KEY_TEST_MODE === "simulado" && process.env.APP_ENV !== "production";

async function availableModels(provider: AiKeyProvider, key: string): Promise<string[]> {
  if (testMode()) {
    if (!key.endsWith("DEMOOK")) throw new AnalystError("A chave foi recusada (teste simulado).");
    return [...AI_KEY_PROVIDERS[provider].preferred];
  }
  return provider === "claude" ? claudeModels(key) : openaiModels(key);
}

export async function aiKeyStatus() {
  const c = await prisma.aiCredential.findFirst({
    select: { provider: true, keyHint: true, model: true, lastTestedAt: true, updatedAt: true },
  });
  return c ? { ...c, provider: c.provider as AiKeyProvider } : null;
}

/** Testa a chave na IA escolhida e, se passar, guarda (substitui a anterior). */
export async function saveAiKey(
  userId: string,
  input: { provider: string; key: string; model: string },
): Promise<AiKeyResult> {
  if (!(await rateLimit(`ia-chave:${userId}`, 10, 3600)))
    return { ok: false, message: "Muitas tentativas. Espere alguns minutos." };
  const current = await prisma.aiCredential.findFirst();
  // Só trocar o modelo, sem colar a chave de novo.
  const keepKey = !input.key.trim() && current && current.provider === input.provider;
  const parsed = keepKey
    ? ({
        ok: true,
        provider: current.provider as AiKeyProvider,
        key: decrypt(current.keyEnc),
        hint: current.keyHint,
      } as const)
    : parseAiKey(input.provider, input.key);
  if (!parsed.ok) return parsed;

  let models: string[];
  try {
    models = chatModels(parsed.provider, await availableModels(parsed.provider, parsed.key));
  } catch (e) {
    if (e instanceof AnalystError) {
      if (e.detail) console.error("[ia-chave]", e.detail);
      return { ok: false, message: e.message };
    }
    throw e;
  }
  const model = pickModel(parsed.provider, models, input.model || null);
  if (!model)
    return { ok: false, message: "A chave funciona, mas a conta não libera nenhum modelo de texto." };

  const data = {
    provider: parsed.provider,
    keyEnc: encrypt(parsed.key),
    keyHint: parsed.hint,
    model,
    lastTestedAt: new Date(),
    updatedById: userId,
  };
  if (current) await prisma.aiCredential.update({ where: { id: current.id }, data });
  else await prisma.aiCredential.create({ data: { ...data, createdById: userId } });
  await audit({
    actorId: userId,
    action: current ? "ai.key_updated" : "ai.key_added",
    entity: "AiCredential",
    entityId: null,
    after: { provedor: parsed.provider, modelo: model, final: parsed.hint },
  });
  return {
    ok: true,
    message: `Chave do ${AI_KEY_PROVIDERS[parsed.provider].label} testada e salva. Modelo: ${model}.`,
  };
}

export async function removeAiKey(userId: string): Promise<AiKeyResult> {
  const c = await prisma.aiCredential.findFirst();
  if (!c) return { ok: false, message: "Nenhuma chave cadastrada." };
  await prisma.aiCredential.deleteMany({ where: { id: c.id } });
  await audit({
    actorId: userId,
    action: "ai.key_removed",
    entity: "AiCredential",
    entityId: null,
    before: { provedor: c.provider, final: c.keyHint },
  });
  return {
    ok: true,
    message: "Chave removida. A empresa volta a usar a IA da plataforma, se estiver ligada.",
  };
}

/** Chave da empresa decifrada (só para chamar a IA no servidor). */
export async function companyAiKey(): Promise<{
  provider: AiKeyProvider;
  key: string;
  model: string;
} | null> {
  const c = await prisma.aiCredential.findFirst();
  return c ? { provider: c.provider as AiKeyProvider, key: decrypt(c.keyEnc), model: c.model } : null;
}

/** Lista de modelos para a tela (com a chave salva). */
export async function modelsForSavedKey(): Promise<string[]> {
  const c = await companyAiKey();
  if (!c) return [];
  try {
    return chatModels(c.provider, await availableModels(c.provider, c.key));
  } catch {
    return [c.model];
  }
}
