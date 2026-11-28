/**
 * IA do próprio cliente: a empresa cadastra a chave de API do Claude (Anthropic) ou do ChatGPT
 * (OpenAI). Login e senha dessas contas não servem para sistemas — só a chave de API.
 */
export type AiGuideStep = { title: string; detail: string; link?: { label: string; href: string } };

export const AI_KEY_PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    company: "Anthropic",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    billingUrl: "https://console.anthropic.com/settings/billing",
    signupUrl: "https://console.anthropic.com",
    pricingUrl: "https://www.anthropic.com/pricing#api",
    /** Modelos preferidos, do mais indicado ao menos (o teste da chave confere quais a conta libera). */
    preferred: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5", "claude-opus-5"],
    guide: [
      {
        title: "Crie a conta de desenvolvedor",
        detail:
          "Entre em console.anthropic.com com o e-mail da sua empresa. É uma conta separada da assinatura Claude Pro: quem já tem o Claude Pro precisa criar esta também.",
        link: { label: "Abrir console.anthropic.com", href: "https://console.anthropic.com" },
      },
      {
        title: "Coloque créditos e um limite de gasto",
        detail:
          "Em Settings › Billing, cadastre um cartão e compre créditos (o mínimo é baixo, a partir de US$ 5). Em Limits, defina um teto mensal: assim a conta nunca gasta mais do que você quer.",
        link: { label: "Abrir a cobrança", href: "https://console.anthropic.com/settings/billing" },
      },
      {
        title: "Gere a chave de API",
        detail:
          "Em Settings › API Keys, clique em Create Key, dê o nome Traffic Manager Pro e copie a chave na hora (ela começa com sk-ant- e só aparece uma vez).",
        link: { label: "Abrir as chaves", href: "https://console.anthropic.com/settings/keys" },
      },
      {
        title: "Cole a chave aqui",
        detail:
          "Cole no campo abaixo e clique em Salvar e testar. O sistema faz um teste rápido com a sua conta antes de guardar.",
      },
    ] satisfies AiGuideStep[],
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    company: "OpenAI",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com/api-keys",
    billingUrl: "https://platform.openai.com/settings/organization/billing",
    signupUrl: "https://platform.openai.com",
    pricingUrl: "https://openai.com/api/pricing",
    preferred: ["gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o"],
    guide: [
      {
        title: "Crie a conta de desenvolvedor",
        detail:
          "Entre em platform.openai.com com o e-mail da sua empresa. É uma conta separada da assinatura ChatGPT Plus: quem já tem o Plus precisa ativar esta também.",
        link: { label: "Abrir platform.openai.com", href: "https://platform.openai.com" },
      },
      {
        title: "Coloque créditos e um limite de gasto",
        detail:
          "Em Settings › Billing, adicione um cartão e compre créditos (a partir de US$ 5). Em Limits, defina um teto mensal para nunca gastar além do planejado.",
        link: {
          label: "Abrir a cobrança",
          href: "https://platform.openai.com/settings/organization/billing",
        },
      },
      {
        title: "Gere a chave de API",
        detail:
          "Em API keys, clique em Create new secret key, dê o nome Traffic Manager Pro e copie a chave na hora (ela começa com sk- e só aparece uma vez).",
        link: { label: "Abrir as chaves", href: "https://platform.openai.com/api-keys" },
      },
      {
        title: "Cole a chave aqui",
        detail:
          "Cole no campo abaixo e clique em Salvar e testar. O sistema faz um teste rápido com a sua conta antes de guardar.",
      },
    ] satisfies AiGuideStep[],
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
