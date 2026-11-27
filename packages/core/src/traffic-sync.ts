/**
 * Gestor de Tráfego IA — regras puras da sincronização (entrega 8.2): datas no fuso da conta,
 * situação das campanhas, valores da Meta, resultados e atualização automática.
 */

import { addDays } from "./dates";

export const META_SYNC_INTERVALS = [0, 15, 30, 60, 180, 360, 720, 1440] as const;
export type MetaSyncInterval = (typeof META_SYNC_INTERVALS)[number];
export const META_DEFAULT_INTERVAL: MetaSyncInterval = 60;
export const isMetaSyncInterval = (v: number): v is MetaSyncInterval =>
  (META_SYNC_INTERVALS as readonly number[]).includes(v);

export function intervalLabel(min: number): string {
  if (min === 0) return "Desligada (só manual)";
  if (min < 60) return `A cada ${min} minutos`;
  if (min === 60) return "A cada 1 hora";
  if (min === 1440) return "Uma vez por dia";
  return `A cada ${min / 60} horas`;
}

/** Dias buscados na primeira sincronização e nas seguintes (a Meta ajusta resultados recentes). */
export const META_FIRST_SYNC_DAYS = 90;
export const META_REFRESH_DAYS = 7;

/** Hora de rodar sozinha? Conta a partir da última TENTATIVA (falha não repete a cada 30 s). */
export function shouldAutoSync(lastStart: Date | null, intervalMinutes: number, now: Date): boolean {
  if (intervalMinutes <= 0) return false;
  return !lastStart || now.getTime() - lastStart.getTime() >= intervalMinutes * 60_000;
}

/** Dia (AAAA-MM-DD) no fuso da conta; fuso inválido → Brasília. */
export function dayInTimeZone(d: Date, timeZone: string): string {
  try {
    return d.toLocaleDateString("sv-SE", { timeZone });
  } catch {
    return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }
}

/** Período a buscar: os últimos N dias, incluindo hoje (no fuso da conta). */
export function syncWindow(now: Date, timeZone: string, firstTime: boolean) {
  const until = dayInTimeZone(now, timeZone);
  const days = firstTime ? META_FIRST_SYNC_DAYS : META_REFRESH_DAYS;
  return { since: addDays(until, -(days - 1)), until };
}

/** Valor decimal da Meta ("123.45") → centavos. Inválido ou negativo → 0. */
export function metaDecimalToCents(v: unknown): number {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d+(\.\d+)?$/.test(s)) return 0;
  return Math.round(Number(s) * 100);
}

/** Orçamento da Meta (texto na menor unidade, ex.: "5000" = R$ 50,00). */
export function metaMinorUnits(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 2_000_000_000 ? n : null;
}

export const metaCount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 2_000_000_000) : 0;
};

export interface MetaAction {
  action_type: string;
  value: string | number;
}

/**
 * A Meta informa o mesmo resultado com vários nomes (ex.: compra "omni", do pixel e padrão).
 * Para não somar duas vezes, usa o PRIMEIRO nome da lista de prioridade que existir.
 */
export const META_RESULT_TYPES = {
  landingViews: ["omni_landing_page_view", "landing_page_view"],
  leads: ["onsite_conversion.lead_grouped", "lead", "offsite_conversion.fb_pixel_lead"],
  registrations: [
    "omni_complete_registration",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
  ],
  conversations: ["onsite_conversion.messaging_conversation_started_7d"],
  purchases: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
} as const;

export function pickAction(
  actions: readonly MetaAction[] | undefined,
  types: readonly string[],
): string | number {
  for (const t of types) {
    const a = actions?.find((x) => x.action_type === t);
    if (a) return a.value;
  }
  return 0;
}

export type MetaSituation = "ativa" | "pausada" | "encerrada" | "analise" | "problema";
export const META_SITUATION_LABELS: Record<MetaSituation, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  analise: "Em análise",
  problema: "Com problema",
};

/** Situação para a tela, a partir do effective_status da Meta e da data de término. */
export function metaSituation(
  effectiveStatus: string,
  endTime: Date | null,
  missingSince: Date | null,
  now: Date,
): MetaSituation {
  if (missingSince || effectiveStatus === "ARCHIVED" || effectiveStatus === "DELETED") return "encerrada";
  if (endTime && endTime.getTime() <= now.getTime()) return "encerrada";
  if (effectiveStatus === "ACTIVE") return "ativa";
  if (effectiveStatus.includes("PAUSED")) return "pausada";
  if (["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"].includes(effectiveStatus)) return "analise";
  return "problema";
}

/** CTR (%) pelos cliques no link e custo por clique/resultado em centavos; sem base → null. */
export const ratio = (part: number, base: number) =>
  base > 0 ? Math.round((part / base) * 10_000) / 100 : null;
export const costPer = (spend: number, count: number) => (count > 0 ? Math.round(spend / count) : null);

/** Resumo do público de um conjunto (sem dados de pessoas): idade, gênero e locais. */
export function targetingSummary(t: unknown): string | null {
  if (!t || typeof t !== "object") return null;
  const x = t as {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[]; cities?: { name?: string }[]; regions?: { name?: string }[] };
  };
  const parts: string[] = [];
  if (x.age_min || x.age_max)
    parts.push(`${x.age_min ?? 13}–${x.age_max ?? 65}${x.age_max === 65 ? "+" : ""} anos`);
  if (x.genders?.length === 1) parts.push(x.genders[0] === 1 ? "homens" : "mulheres");
  const places = [
    ...(x.geo_locations?.cities ?? []).map((c) => c.name),
    ...(x.geo_locations?.regions ?? []).map((r) => r.name),
    ...(x.geo_locations?.countries ?? []),
  ].filter(Boolean);
  if (places.length) parts.push(places.slice(0, 5).join(", ") + (places.length > 5 ? "…" : ""));
  return parts.length ? parts.join(" · ").slice(0, 300) : null;
}

export const META_OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_SALES: "Vendas",
  OUTCOME_LEADS: "Cadastros",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "App",
  MESSAGES: "Mensagens",
  CONVERSIONS: "Conversões",
  LINK_CLICKS: "Cliques no link",
};
export const objectiveLabel = (o: string | null) => (o ? (META_OBJECTIVE_LABELS[o] ?? o) : "—");

export const REPORT_PERIODS = [7, 14, 30, 90] as const;
