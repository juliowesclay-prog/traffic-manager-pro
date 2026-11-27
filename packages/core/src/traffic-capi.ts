/**
 * Gestor de Tráfego IA — API de Conversões da Meta (entrega 8.7). Regras puras.
 *
 * O que é enviado (mínimo necessário): o nome do evento, a hora, um código único (para a Meta não
 * contar duas vezes), a página de entrada, o código do clique no anúncio (`fbc`, montado com o
 * fbclid) e um identificador da pessoa com HASH (nunca o nome, CPF, telefone ou e-mail).
 * Só para quem chegou por um clique em anúncio da Meta (tem fbclid). Sem clique, nada é enviado.
 */

export const CAPI_EVENTS = {
  CADASTRO: "CompleteRegistration",
  VENDA: "Purchase",
} as const;
export type CapiKind = keyof typeof CAPI_EVENTS;

export const CAPI_EVENT_LABELS: Record<CapiKind, string> = {
  CADASTRO: "Cadastro",
  VENDA: "Venda (1ª mensalidade paga)",
};

export const CAPI_STATUS_LABELS = {
  PENDENTE: "Na fila",
  ENVIADO: "Enviado",
  ERRO: "Erro (vai tentar de novo)",
  DESCARTADO: "Não enviado",
} as const;

export const CAPI_LIMITS = {
  /** A Meta só aceita eventos de até 7 dias atrás; usamos 6 dias e 23 h para ter folga. */
  maxAgeMs: (7 * 24 - 1) * 3_600_000,
  maxAttempts: 5,
  /** Eventos por envio (a Meta aceita até 1.000). */
  batchSize: 100,
  /** Pausa antes de tentar de novo: 1, 4, 16, 64 min… */
  retryBaseMinutes: 1,
};

export interface CapiSettings {
  enabled: boolean;
  /** ID do conjunto de dados (pixel) na Meta. */
  datasetId: string | null;
  /** Código de teste do Gerenciador de Eventos (eventos aparecem só em "Eventos de teste"). */
  testEventCode: string | null;
}

export const isDatasetId = (v: unknown): v is string => typeof v === "string" && /^\d{8,25}$/.test(v);
export const isTestEventCode = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9]{4,20}$/.test(v);

export function normalizeCapiSettings(v: unknown): CapiSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const datasetId = isDatasetId(o.datasetId) ? o.datasetId : null;
  return {
    // Ligar sem conjunto de dados não faz sentido: fica desligado.
    enabled: o.enabled === true && datasetId != null,
    datasetId,
    testEventCode: isTestEventCode(o.testEventCode) ? o.testEventCode : null,
  };
}

/** Código único do evento NA FILA (nunca entra duas vezes). Para a Meta vai outro código, aleatório. */
export const capiEventId = (kind: CapiKind, sourceId: string) =>
  `${kind === "CADASTRO" ? "cad" : "venda"}_${sourceId}`;

/** Parâmetro fbc da Meta: fb.1.<hora do clique em ms>.<fbclid>. */
export function buildFbc(fbclid: string | null | undefined, clickedAt: Date): string | null {
  if (!fbclid || !/^[A-Za-z0-9_-]{10,500}$/.test(fbclid)) return null;
  return `fb.1.${clickedAt.getTime()}.${fbclid}`;
}

/** O evento ainda pode ser enviado (a Meta recusa eventos com mais de 7 dias)? */
export const withinCapiWindow = (eventTime: Date, now: Date) =>
  now.getTime() - eventTime.getTime() <= CAPI_LIMITS.maxAgeMs &&
  eventTime.getTime() <= now.getTime() + 60_000;

/** Quando tentar de novo depois de `attempts` falhas (null = desistir). */
export function capiRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= CAPI_LIMITS.maxAttempts) return null;
  const minutes = CAPI_LIMITS.retryBaseMinutes * 4 ** Math.max(0, attempts - 1);
  return new Date(now.getTime() + minutes * 60_000);
}

export interface CapiEventInput {
  kind: CapiKind;
  eventId: string;
  eventTime: Date;
  /** Endereço da página de entrada (site do Prosed). */
  sourceUrl: string;
  fbc: string;
  /** Identificador da pessoa JÁ com hash SHA-256 (hex). */
  externalIdHash: string;
  /** Centavos (só venda). */
  valueCents: number | null;
}

/** Monta o evento no formato da Meta. Recusa o que não estiver no formato esperado. */
export function buildCapiEvent(e: CapiEventInput) {
  if (!/^[0-9a-f]{64}$/.test(e.externalIdHash)) throw new Error("external_id precisa estar com hash");
  if (!e.fbc.startsWith("fb.1.")) throw new Error("fbc inválido");
  return {
    event_name: CAPI_EVENTS[e.kind],
    event_time: Math.floor(e.eventTime.getTime() / 1000),
    event_id: e.eventId,
    action_source: "website" as const,
    event_source_url: e.sourceUrl,
    user_data: { fbc: e.fbc, external_id: [e.externalIdHash] },
    ...(e.kind === "VENDA" && e.valueCents != null
      ? { custom_data: { currency: "BRL", value: Math.round(e.valueCents) / 100 } }
      : {}),
  };
}
export type CapiEvent = ReturnType<typeof buildCapiEvent>;
