/**
 * IA do próprio cliente: a empresa cadastra a chave de API do Claude (Anthropic) ou do ChatGPT
 * (OpenAI). Login e senha dessas contas não servem para sistemas — só a chave de API.
 */
export const AI_KEY_PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    billingUrl: "https://console.anthropic.com/settings/billing",
    /** Modelos preferidos, do mais indicado ao menos (o teste da chave confere quais a conta libera). */
    preferred: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5", "claude-opus-5"],
    steps: [
      "Entre em console.anthropic.com com a conta da sua empresa (é diferente da assinatura Claude Pro).",
      "Em Billing, cadastre um cartão e defina um limite mensal de gasto.",
      "Em API Keys, clique em Create Key, dê um nome (ex.: Traffic Manager Pro) e copie a chave (começa com sk-ant-).",
      "Cole a chave aqui e clique em Salvar e testar.",
    ],
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com/api-keys",
    billingUrl: "https://platform.openai.com/settings/organization/billing",
    preferred: ["gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o"],
    steps: [
      "Entre em platform.openai.com com a conta da sua empresa (é diferente da assinatura ChatGPT Plus).",
      "Em Billing, adicione créditos e defina um limite de gasto.",
      "Em API keys, clique em Create new secret key, dê um nome (ex.: Traffic Manager Pro) e copie a chave (começa com sk-).",
      "Cole a chave aqui e clique em Salvar e testar.",
    ],
  },
} as const;
export type AiKeyProvider = keyof typeof AI_KEY_PROVIDERS;

export function parseAiKey(
  provider: string,
  key: string,
): { ok: true; provider: AiKeyProvider; key: string; hint: string } | { ok: false; message: string } {
  if (!(provider in AI_KEY_PROVIDERS)) return { ok: false, message: "Escolha Claude ou ChatGPT." };
  const p = provider as AiKeyProvider;
  const k = key.trim();
  if (/\s/.test(k) || k.length < 20 || k.length > 300)
    return { ok: false, message: "Chave inválida. Copie a chave inteira, sem espaços." };
  if (!k.startsWith(AI_KEY_PROVIDERS[p].keyPrefix))
    return {
      ok: false,
      message: `A chave do ${AI_KEY_PROVIDERS[p].label} começa com ${AI_KEY_PROVIDERS[p].keyPrefix}.`,
    };
  if (p === "openai" && k.startsWith("sk-ant-"))
    return { ok: false, message: "Esta é uma chave do Claude. Escolha Claude (Anthropic)." };
  return { ok: true, provider: p, key: k, hint: k.slice(-4) };
}

/** Escolhe o modelo: o pedido (se a conta libera), senão o primeiro preferido disponível. */
export function pickModel(
  provider: AiKeyProvider,
  available: string[],
  wanted?: string | null,
): string | null {
  if (wanted && available.includes(wanted)) return wanted;
  for (const m of AI_KEY_PROVIDERS[provider].preferred) if (available.includes(m)) return m;
  if (provider === "openai") return available.find((m) => /^gpt-[\d.]+$/.test(m)) ?? null;
  return available.find((m) => m.startsWith("claude-")) ?? null;
}

/** Modelos que fazem sentido mostrar na lista (texto/chat). */
export function chatModels(provider: AiKeyProvider, ids: string[]): string[] {
  const ok = provider === "claude" ? /^claude-/ : /^(gpt-[\d.]+o?(-mini)?|o\d(-mini)?)$/;
  return [...new Set(ids.filter((m) => ok.test(m)))].sort();
}
