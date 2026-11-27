/**
 * Gestor de Tráfego IA (Fase 8) — regras puras da conexão com a Meta (entrega 8.1).
 * Nada aqui chama a Meta: só monta, confere e classifica.
 */

/** Permissões da Meta que o módulo pede. As duas primeiras são obrigatórias. */
export const META_REQUIRED_SCOPES = ["ads_read", "ads_management"] as const;
export const META_OPTIONAL_SCOPES = ["business_management"] as const;
export const META_SCOPES = [...META_REQUIRED_SCOPES, ...META_OPTIONAL_SCOPES];

export const META_SCOPE_LABELS: Record<string, string> = {
  ads_read: "Ler campanhas, anúncios e resultados",
  ads_management: "Gerenciar anúncios (pausar, ajustar orçamento — sempre com aprovação no Prosed)",
  business_management: "Ver as contas de anúncio do Gerenciador de Negócios",
};

/** Permissões obrigatórias que a Meta NÃO concedeu (a pessoa pode desmarcar na tela da Meta). */
export function missingMetaScopes(granted: readonly string[]): string[] {
  return META_REQUIRED_SCOPES.filter((s) => !granted.includes(s));
}

/** Quantos dias antes de vencer a chave o painel avisa para reconectar. */
export const META_TOKEN_WARN_DAYS = 7;

export type MetaTokenHealth =
  | { state: "ok"; daysLeft: number }
  | { state: "vence_em_breve"; daysLeft: number }
  | { state: "vencido"; daysLeft: 0 }
  | { state: "sem_validade" };

/** Situação da chave de acesso. Sem data = chave que não vence (ex.: usuário do sistema da empresa). */
export function metaTokenHealth(expiresAt: Date | null, now: Date): MetaTokenHealth {
  if (!expiresAt) return { state: "sem_validade" };
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return { state: "vencido", daysLeft: 0 };
  const daysLeft = Math.floor(ms / 86_400_000);
  return daysLeft < META_TOKEN_WARN_DAYS ? { state: "vence_em_breve", daysLeft } : { state: "ok", daysLeft };
}

/** account_status da Meta → texto. */
export const META_ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Pagamento pendente",
  7: "Em análise de risco",
  8: "Acerto pendente",
  9: "Em período de carência",
  100: "Encerramento pendente",
  101: "Encerrada",
  201: "Ativa",
  202: "Encerrada",
};
export const metaAccountStatusLabel = (s: number) => META_ACCOUNT_STATUS_LABELS[s] ?? `Situação ${s}`;
/** Só contas ativas (ou em carência) podem ser escolhidas para veicular. */
export const metaAccountUsable = (s: number) => s === 1 || s === 9 || s === 201;

export const isMetaAdAccountId = (v: string) => /^act_\d{1,30}$/.test(v);

/**
 * Endereço da tela de autorização da Meta (Login do Facebook para Empresas).
 * Com `configId` (configuração criada no app da Meta) usa config_id; senão pede as permissões direto.
 */
export function metaAuthorizeUrl(o: {
  graphVersion: string;
  appId: string;
  redirectUri: string;
  state: string;
  configId?: string;
}): string {
  const p = new URLSearchParams({
    client_id: o.appId,
    redirect_uri: o.redirectUri,
    state: o.state,
    response_type: "code",
  });
  if (o.configId) p.set("config_id", o.configId);
  else p.set("scope", META_SCOPES.join(","));
  return `https://www.facebook.com/${o.graphVersion}/dialog/oauth?${p.toString()}`;
}

/** Erros que a Meta devolve no retorno da autorização → mensagem para a tela (nunca o texto cru). */
export function metaCallbackErrorMessage(error: string | null, reason: string | null): string {
  if (error === "access_denied" || reason === "user_denied")
    return "A autorização foi cancelada na Meta. Nada foi conectado.";
  return "A Meta não concluiu a autorização. Tente de novo.";
}

export const META_STATE_TTL_MINUTES = 10;
