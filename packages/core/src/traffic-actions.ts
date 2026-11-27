/**
 * Gestor de Tráfego IA — ações nos anúncios com aprovação (entrega 8.6). Regras puras.
 *
 * - Pausar e reduzir orçamento diminuem o gasto: quem tem `traffic:manage` executa direto.
 * - Reativar e aumentar orçamento podem aumentar o gasto: viram PEDIDO, que só é executado depois da
 *   aprovação de OUTRA pessoa com `traffic:approve`, e só se couber no TETO diário configurado.
 * - Sem teto configurado, nada que aumente o gasto é aceito.
 * - Aumento de orçamento tem limite por vez (%), e o orçamento mínimo é R$ 1,00.
 * - Itens com orçamento TOTAL (vitalício) não são alterados aqui (o gasto diário não é previsível).
 */

import { formatBRL } from "./money";

export const TRAFFIC_ACTION_KINDS = ["PAUSAR", "REATIVAR", "ORCAMENTO"] as const;
export type TrafficActionKind = (typeof TRAFFIC_ACTION_KINDS)[number];
export const isTrafficActionKind = (v: unknown): v is TrafficActionKind =>
  typeof v === "string" && (TRAFFIC_ACTION_KINDS as readonly string[]).includes(v);

export const TRAFFIC_ACTION_LABELS: Record<TrafficActionKind, string> = {
  PAUSAR: "Pausar",
  REATIVAR: "Reativar",
  ORCAMENTO: "Mudar orçamento diário",
};

export type TrafficLevel = "CAMPANHA" | "CONJUNTO" | "ANUNCIO";
export const TRAFFIC_LEVEL_LABELS: Record<TrafficLevel, string> = {
  CAMPANHA: "Campanha",
  CONJUNTO: "Conjunto de anúncios",
  ANUNCIO: "Anúncio",
};

export const TRAFFIC_ACTION_STATUS_LABELS = {
  PENDENTE: "Aguardando aprovação",
  EXECUTANDO: "Executando",
  EXECUTADA: "Feita na Meta",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
  EXPIRADA: "Venceu sem aprovação",
  FALHOU: "Não foi feita",
} as const;

export const TRAFFIC_ACTION_LIMITS = {
  /** Orçamento diário mínimo aceito (centavos). */
  minDailyBudget: 100,
  /** Teto máximo que pode ser configurado (R$ 100 mil por dia), contra erro de digitação. */
  maxDailyCap: 10_000_000,
  /** Aumento máximo por vez (padrão e limite da configuração), em %. */
  defaultMaxIncreasePct: 30,
  maxIncreasePctCeiling: 100,
  /** Pedido de aprovação vence depois disto. */
  approvalHours: 24,
  /** Ações por pessoa por hora. */
  perUserPerHour: 30,
  /** Execução presa em "executando" é encerrada depois disto. */
  staleMinutes: 5,
  reasonMin: 10,
  reasonMax: 500,
};

/** Configuração das ações (guardada em Setting). Sem teto = nada que aumente gasto é aceito. */
export interface TrafficActionSettings {
  enabled: boolean;
  /** Teto da soma dos orçamentos diários ativos (centavos). */
  dailyCapCents: number | null;
  maxIncreasePct: number;
}

export function normalizeActionSettings(v: unknown): TrafficActionSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cap = Number(o.dailyCapCents);
  const pct = Number(o.maxIncreasePct);
  return {
    enabled: o.enabled === true,
    dailyCapCents:
      Number.isInteger(cap) &&
      cap >= TRAFFIC_ACTION_LIMITS.minDailyBudget &&
      cap <= TRAFFIC_ACTION_LIMITS.maxDailyCap
        ? cap
        : null,
    maxIncreasePct:
      Number.isInteger(pct) && pct >= 1 && pct <= TRAFFIC_ACTION_LIMITS.maxIncreasePctCeiling
        ? pct
        : TRAFFIC_ACTION_LIMITS.defaultMaxIncreasePct,
  };
}

// ─── Orçamento diário ativo ──────────────────────────────────────────

export interface BudgetCampaign {
  id: string;
  /** status CONFIGURADO na Meta (ACTIVE, PAUSED, ARCHIVED, DELETED). */
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}
export interface BudgetAdSet extends BudgetCampaign {
  campaignId: string;
}
export interface BudgetTree {
  campaigns: BudgetCampaign[];
  adSets: BudgetAdSet[];
}

/**
 * Soma dos orçamentos diários que estão gastando: campanha ativa com orçamento próprio, ou, quando a
 * campanha não tem orçamento, os conjuntos ativos dela. `lifetimeIds` = itens ativos com orçamento total.
 */
export function activeDailyBudget(tree: BudgetTree): { total: number; lifetimeIds: string[] } {
  let total = 0;
  const lifetimeIds: string[] = [];
  for (const c of tree.campaigns) {
    if (c.status !== "ACTIVE") continue;
    if (c.dailyBudget) total += c.dailyBudget;
    else if (c.lifetimeBudget) lifetimeIds.push(c.id);
    else
      for (const s of tree.adSets) {
        if (s.campaignId !== c.id || s.status !== "ACTIVE") continue;
        if (s.dailyBudget) total += s.dailyBudget;
        else if (s.lifetimeBudget) lifetimeIds.push(s.id);
      }
  }
  return { total, lifetimeIds };
}

// ─── Planejamento de uma ação ────────────────────────────────────────

export interface ActionTarget {
  level: TrafficLevel;
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

export interface ActionPlan {
  kind: TrafficActionKind;
  fromStatus: string;
  toStatus: string;
  fromBudget: number | null;
  toBudget: number | null;
  /** Pode aumentar o gasto → precisa de aprovação de outra pessoa e do teto. */
  increasesSpend: boolean;
  totalBefore: number;
  totalAfter: number;
  capCents: number | null;
  /** Aumento do orçamento em % (só para aumento de orçamento). */
  increasePct: number | null;
}

export type PlanResult = { ok: true; plan: ActionPlan } | { ok: false; message: string };

const brl = formatBRL;

function withChange(tree: BudgetTree, t: ActionTarget, status: string, daily: number | null): BudgetTree {
  if (t.level === "CAMPANHA")
    return {
      ...tree,
      campaigns: tree.campaigns.map((c) => (c.id === t.id ? { ...c, status, dailyBudget: daily } : c)),
    };
  if (t.level === "CONJUNTO")
    return {
      ...tree,
      adSets: tree.adSets.map((s) => (s.id === t.id ? { ...s, status, dailyBudget: daily } : s)),
    };
  return tree; // anúncio não tem orçamento próprio
}

/**
 * Confere se a ação pode ser feita e calcula o antes/depois. A árvore deve trazer o estado atual
 * (o item alvo com os valores lidos agora da Meta).
 */
export function planTrafficAction(o: {
  target: ActionTarget;
  kind: TrafficActionKind;
  newBudget?: number | null;
  tree: BudgetTree;
  settings: TrafficActionSettings;
}): PlanResult {
  const { target: t, kind, tree, settings } = o;
  const L = TRAFFIC_ACTION_LIMITS;
  if (t.status === "ARCHIVED" || t.status === "DELETED")
    return { ok: false, message: "Este item está encerrado na Meta e não pode ser alterado aqui." };

  let toStatus = t.status;
  let toBudget = t.dailyBudget;
  let increasesSpend = false;
  let increasePct: number | null = null;

  if (kind === "PAUSAR") {
    if (t.status !== "ACTIVE") return { ok: false, message: "Este item já está pausado." };
    toStatus = "PAUSED";
  } else if (kind === "REATIVAR") {
    if (t.status !== "PAUSED") return { ok: false, message: "Este item já está ativo." };
    toStatus = "ACTIVE";
    increasesSpend = true;
  } else {
    if (t.level === "ANUNCIO")
      return { ok: false, message: "Anúncio não tem orçamento: mude o da campanha ou do conjunto." };
    if (t.lifetimeBudget && !t.dailyBudget)
      return {
        ok: false,
        message: "Este item usa orçamento total (do período inteiro). Ajuste direto na Meta.",
      };
    if (!t.dailyBudget)
      return {
        ok: false,
        message:
          t.level === "CAMPANHA"
            ? "O orçamento desta campanha fica nos conjuntos de anúncios: mude o do conjunto."
            : "O orçamento deste conjunto fica na campanha: mude o da campanha.",
      };
    const nb = o.newBudget;
    if (nb == null || !Number.isInteger(nb))
      return { ok: false, message: "Informe o novo orçamento diário." };
    if (nb < L.minDailyBudget)
      return { ok: false, message: `O orçamento diário mínimo é ${brl(L.minDailyBudget)}.` };
    if (nb > L.maxDailyCap) return { ok: false, message: "Valor de orçamento alto demais." };
    if (nb === t.dailyBudget) return { ok: false, message: "O novo orçamento é igual ao atual." };
    toBudget = nb;
    if (nb > t.dailyBudget) {
      increasesSpend = true;
      increasePct = Math.ceil(((nb - t.dailyBudget) / t.dailyBudget) * 1000) / 10;
      // Conta exata em inteiros (o % mostrado é arredondado).
      if (nb * 100 > t.dailyBudget * (100 + settings.maxIncreasePct))
        return {
          ok: false,
          message: `Aumento de ${increasePct.toLocaleString("pt-BR")}%: o máximo por vez é ${settings.maxIncreasePct}%. Até ${brl(Math.floor((t.dailyBudget * (100 + settings.maxIncreasePct)) / 100))} por dia.`,
        };
    }
  }

  const before = activeDailyBudget(tree);
  const after = activeDailyBudget(withChange(tree, t, toStatus, toBudget));
  const plan: ActionPlan = {
    kind,
    fromStatus: t.status,
    toStatus,
    fromBudget: t.dailyBudget,
    toBudget: kind === "ORCAMENTO" ? toBudget : null,
    increasesSpend,
    totalBefore: before.total,
    totalAfter: after.total,
    capCents: settings.dailyCapCents,
    increasePct,
  };
  if (!increasesSpend) return { ok: true, plan };

  // Daqui para baixo: pode aumentar o gasto.
  const newLifetime = after.lifetimeIds.filter((id) => !before.lifetimeIds.includes(id));
  if (newLifetime.length)
    return {
      ok: false,
      message:
        "Reativar este item liga um orçamento total (do período inteiro), que o teto diário não controla. Reative direto na Meta, se for o caso.",
    };
  if (settings.dailyCapCents == null)
    return {
      ok: false,
      message:
        "Ainda não há teto de gasto diário definido. Sem teto, nada que aumente o gasto pode ser pedido.",
    };
  if (after.total > settings.dailyCapCents)
    return {
      ok: false,
      message: `Passaria do teto: o gasto diário ativo iria para ${brl(after.total)} e o teto é ${brl(settings.dailyCapCents)}.`,
    };
  return { ok: true, plan };
}

/** O item mudou na Meta desde o pedido? (status ou orçamento diferentes do que foi aprovado). */
export function changedSinceRequest(
  planned: { fromStatus: string; fromBudget: number | null; kind: TrafficActionKind },
  now: { status: string; dailyBudget: number | null },
): boolean {
  if (planned.fromStatus !== now.status) return true;
  return planned.kind === "ORCAMENTO" && planned.fromBudget !== now.dailyBudget;
}

/** Quem pode aprovar: permissão `traffic:approve`, pedido pendente e não vencido, e NÃO quem pediu. */
export function approvalBlock(
  a: { status: string; requestedById: string; expiresAt: Date | null },
  approverId: string,
  now: Date,
): string | null {
  if (a.status !== "PENDENTE") return "Este pedido não está mais aguardando aprovação.";
  if (a.expiresAt && a.expiresAt.getTime() <= now.getTime())
    return "Este pedido venceu. Peça de novo, se ainda fizer sentido.";
  if (a.requestedById === approverId)
    return "Quem pediu não pode aprovar o próprio pedido. Outra pessoa com permissão precisa aprovar.";
  return null;
}

/** Texto curto do que a ação faz (para listas e auditoria). */
export function describeTrafficAction(a: {
  kind: TrafficActionKind;
  fromBudget: number | null;
  toBudget: number | null;
}): string {
  if (a.kind === "PAUSAR") return "Pausar";
  if (a.kind === "REATIVAR") return "Reativar";
  return `Orçamento diário de ${a.fromBudget == null ? "—" : brl(a.fromBudget)} para ${a.toBudget == null ? "—" : brl(a.toBudget)}`;
}

/** Sugestão da IA (8.5) → ação que pode ser preparada aqui. */
export const AI_SUGGESTION_TO_ACTION: Partial<Record<string, TrafficActionKind>> = {
  pausar_anuncio: "PAUSAR",
  pausar_campanha: "PAUSAR",
  reativar: "REATIVAR",
  reduzir_orcamento: "ORCAMENTO",
  aumentar_orcamento: "ORCAMENTO",
};
