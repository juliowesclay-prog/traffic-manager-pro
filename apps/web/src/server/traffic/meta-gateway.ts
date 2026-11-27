import "server-only";

/** Conta de anúncios como a Meta informa (já normalizada). */
export interface MetaAccountInfo {
  accountId: string; // act_123
  name: string;
  currency: string;
  timezone: string;
  accountStatus: number;
  businessName: string | null;
}

export interface MetaTokenInfo {
  valid: boolean;
  scopes: string[];
  /** null = chave que não vence. */
  expiresAt: Date | null;
}

/** Integração com a Meta (Marketing API). Implementações: real (graph.facebook.com) e simulada (só dev). */
export interface MetaGateway {
  /** Somente leitura: campanhas, conjuntos, anúncios e resultados. */
  read: MetaAdsReader;
  /** Escrita (8.6): pausar, reativar e orçamento diário. Só chamada pelo serviço de ações com aprovação. */
  write: MetaAdsWriter;
  /** API de Conversões (8.7): envia eventos de cadastro e venda ao conjunto de dados (pixel). */
  conversions: MetaConversionsSender;
  name: "meta" | "simulado";
  authorizeUrl(state: string, redirectUri: string): string;
  /** Troca o código da autorização por uma chave de longa duração. */
  exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresAt: Date | null }>;
  inspectToken(token: string): Promise<MetaTokenInfo>;
  me(token: string): Promise<{ id: string; name: string }>;
  adAccounts(token: string): Promise<MetaAccountInfo[]>;
  /** Retira as permissões dadas ao app (desconectar). */
  revoke(token: string): Promise<void>;
}

/** Erro da Meta com mensagem segura para a tela; `detail` vai só para log/auditoria (sem chaves). */
export class MetaError extends Error {
  constructor(
    message: string,
    public detail?: string,
    /** true quando a chave venceu ou foi revogada (código 190): precisa reconectar. */
    public tokenInvalid = false,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

// ─── Leitura de anúncios (entrega 8.2) ─────────────────

export interface MetaCampaignInfo {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
  startTime: Date | null;
  stopTime: Date | null;
}

export interface MetaAdSetInfo {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  optimizationGoal: string | null;
  targetingSummary: string | null;
  startTime: Date | null;
  endTime: Date | null;
}

export interface MetaCreativeInfo {
  id: string;
  name: string | null;
  title: string | null;
  body: string | null;
  callToAction: string | null;
  objectType: string | null;
  thumbnailUrl: string | null;
}

export interface MetaAdInfo {
  id: string;
  adSetId: string;
  campaignId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  creative: MetaCreativeInfo | null;
}

export type MetaInsightLevel = "campaign" | "adset" | "ad";

export interface MetaInsightRow {
  objectId: string;
  date: string; // AAAA-MM-DD no fuso da conta
  spend: number; // centavos
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  landingViews: number;
  leads: number;
  registrations: number;
  conversations: number;
  purchases: number;
  purchaseValue: number; // centavos
  actions: { action_type: string; value: string | number }[];
}

export interface MetaAdsReader {
  campaigns(token: string, accountId: string): Promise<MetaCampaignInfo[]>;
  adSets(token: string, accountId: string): Promise<MetaAdSetInfo[]>;
  ads(token: string, accountId: string): Promise<MetaAdInfo[]>;
  insights(
    token: string,
    accountId: string,
    level: MetaInsightLevel,
    since: string,
    until: string,
  ): Promise<MetaInsightRow[]>;
}

// ─── Ações (entrega 8.6) ─────────────────

/** Estado atual de uma campanha, conjunto ou anúncio, lido na hora da ação. */
export interface MetaObjectState {
  id: string;
  /** Conta dona do item, no formato act_123 (conferida contra a conta escolhida). */
  accountId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  /** Centavos; anúncio não tem orçamento. */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

export interface MetaAdsWriter {
  get(token: string, level: MetaInsightLevel, id: string): Promise<MetaObjectState>;
  setStatus(token: string, id: string, status: "ACTIVE" | "PAUSED"): Promise<void>;
  /** Novo orçamento diário (centavos = menor unidade da moeda). */
  setDailyBudget(token: string, id: string, cents: number): Promise<void>;
}

// ─── API de Conversões (entrega 8.7) ─────────────────

export interface MetaConversionsSender {
  /** Envia até 1.000 eventos. `testEventCode`: aparecem só em "Eventos de teste". */
  send(
    token: string,
    datasetId: string,
    events: Record<string, unknown>[],
    testEventCode: string | null,
  ): Promise<{ received: number }>;
}
