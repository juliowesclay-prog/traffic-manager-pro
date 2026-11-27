import "server-only";
import {
  activeDailyBudget,
  approvalBlock,
  changedSinceRequest,
  cleanText,
  describeTrafficAction,
  isTrafficActionKind,
  missingMetaScopes,
  normalizeActionSettings,
  planTrafficAction,
  TRAFFIC_ACTION_LIMITS as L,
  type ActionTarget,
  type BudgetTree,
  type TrafficActionKind,
  type TrafficActionSettings,
  type TrafficLevel,
} from "@tmp/core";
import { decrypt, Prisma } from "@tmp/db";
import { prisma } from "@/server/db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { activeConnection, type TrafficResult } from "./connection";
import { metaByName, MetaError } from "./index";
import type { MetaInsightLevel, MetaObjectState } from "./meta-gateway";

/**
 * Ações nos anúncios com aprovação (entrega 8.6).
 * - Desligadas até alguém com `traffic:approve` ligar (interruptor geral).
 * - Pausar e reduzir orçamento: quem tem `traffic:manage` executa na hora.
 * - Reativar e aumentar orçamento: viram pedido; só OUTRA pessoa com `traffic:approve` aprova, e só se
 *   couber no teto diário. Na aprovação o item é lido de novo na Meta: se mudou, nada é feito.
 * - Antes de qualquer mudança, o item é lido na Meta e precisa ser da conta escolhida.
 * - Tudo fica no histórico e na auditoria (antes/depois, quem pediu, quem aprovou).
 */

export const ACTIONS_SETTING_KEY = "traffic.actions";
const LEVEL_API: Record<TrafficLevel, MetaInsightLevel> = {
  CAMPANHA: "campaign",
  CONJUNTO: "adset",
  ANUNCIO: "ad",
};
const DISABLED =
  "As ações na Meta estão desligadas. Quem pode aprovar ações liga em “Teto e regras”, nesta mesma tela.";
const OPEN_EXISTS =
  "Já existe uma ação aberta para este item (aguardando aprovação ou executando). Decida ou cancele a anterior primeiro.";

export type ActionResult = TrafficResult & { id?: string };

// ─── Configuração ────────────────────────────────────────────────────

export async function actionSettings(): Promise<TrafficActionSettings> {
  const s = await prisma.setting.findUnique({ where: { key: ACTIONS_SETTING_KEY } });
  return normalizeActionSettings(s?.value);
}

export async function saveActionSettings(
  userId: string,
  input: { enabled: boolean; dailyCapCents: number | null; maxIncreasePct: number },
): Promise<TrafficResult> {
  const cap = input.dailyCapCents;
  if (cap != null && (!Number.isInteger(cap) || cap < L.minDailyBudget || cap > L.maxDailyCap))
    return { ok: false, message: "Teto inválido: use um valor entre R$ 1,00 e R$ 100.000,00 por dia." };
  if (
    !Number.isInteger(input.maxIncreasePct) ||
    input.maxIncreasePct < 1 ||
    input.maxIncreasePct > L.maxIncreasePctCeiling
  )
    return { ok: false, message: `Aumento máximo por vez: de 1% a ${L.maxIncreasePctCeiling}%.` };
  const before = await actionSettings();
  const value = { enabled: input.enabled, dailyCapCents: cap, maxIncreasePct: input.maxIncreasePct };
  await prisma.setting.upsert({
    where: { key: ACTIONS_SETTING_KEY },
    create: {
      key: ACTIONS_SETTING_KEY,
      value,
      description: "Ações nos anúncios: teto e regras",
      updatedById: userId,
    },
    update: { value, updatedById: userId },
  });
  await audit({
    actorId: userId,
    action: "traffic.actions_settings",
    entity: "Setting",
    entityId: ACTIONS_SETTING_KEY,
    before: { ...before },
    after: value,
  });
  return { ok: true, message: "Teto e regras salvos." };
}

// ─── Dados sincronizados ─────────────────────────────────────────────

export async function selectedAccount() {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected) ?? null;
  return { conn, account };
}

/** Árvore de orçamentos (campanhas e conjuntos) pelos dados sincronizados. */
async function budgetTree(accountId: string): Promise<BudgetTree> {
  const sel = { externalId: true, status: true, dailyBudget: true, lifetimeBudget: true } as const;
  const [campaigns, adSets] = await Promise.all([
    prisma.metaCampaign.findMany({ where: { accountId, missingSince: null }, select: sel }),
    prisma.metaAdSet.findMany({
      where: { accountId, missingSince: null },
      select: { ...sel, campaignExternalId: true },
    }),
  ]);
  return {
    campaigns: campaigns.map((c) => ({ id: c.externalId, ...c })),
    adSets: adSets.map((s) => ({ id: s.externalId, campaignId: s.campaignExternalId, ...s })),
  };
}

function treeWith(tree: BudgetTree, t: ActionTarget): BudgetTree {
  const patch = { status: t.status, dailyBudget: t.dailyBudget, lifetimeBudget: t.lifetimeBudget };
  if (t.level === "CAMPANHA")
    return { ...tree, campaigns: tree.campaigns.map((c) => (c.id === t.id ? { ...c, ...patch } : c)) };
  if (t.level === "CONJUNTO")
    return { ...tree, adSets: tree.adSets.map((s) => (s.id === t.id ? { ...s, ...patch } : s)) };
  return tree;
}

/** Item pelos dados sincronizados (campanha, conjunto ou anúncio da conta). */
async function localTarget(accountId: string, objectId: string): Promise<ActionTarget | null> {
  if (!/^\d{1,30}$/.test(objectId)) return null;
  const where = { accountId_externalId: { accountId, externalId: objectId } };
  const c = await prisma.metaCampaign.findUnique({ where });
  if (c && !c.missingSince)
    return {
      level: "CAMPANHA",
      id: objectId,
      name: c.name,
      status: c.status,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
    };
  const s = await prisma.metaAdSet.findUnique({ where });
  if (s && !s.missingSince)
    return {
      level: "CONJUNTO",
      id: objectId,
      name: s.name,
      status: s.status,
      dailyBudget: s.dailyBudget,
      lifetimeBudget: s.lifetimeBudget,
    };
  const a = await prisma.metaAd.findUnique({ where });
  if (a && !a.missingSince)
    return {
      level: "ANUNCIO",
      id: objectId,
      name: a.name,
      status: a.status,
      dailyBudget: null,
      lifetimeBudget: null,
    };
  return null;
}

/** Grava no espelho local o que a Meta acabou de informar (a próxima sincronização confirma o resto). */
async function updateLocal(accountId: string, level: TrafficLevel, id: string, st: Partial<MetaObjectState>) {
  const where = { accountId_externalId: { accountId, externalId: id } };
  const base = {
    ...(st.status ? { status: st.status } : {}),
    ...(st.effectiveStatus ? { effectiveStatus: st.effectiveStatus } : {}),
  };
  const budget = {
    ...(st.dailyBudget !== undefined ? { dailyBudget: st.dailyBudget } : {}),
    ...(st.lifetimeBudget !== undefined ? { lifetimeBudget: st.lifetimeBudget } : {}),
  };
  if (level === "CAMPANHA")
    await prisma.metaCampaign.updateMany({ where: where.accountId_externalId, data: { ...base, ...budget } });
  else if (level === "CONJUNTO")
    await prisma.metaAdSet.updateMany({ where: where.accountId_externalId, data: { ...base, ...budget } });
  else await prisma.metaAd.updateMany({ where: where.accountId_externalId, data: base });
}

/** Itens que podem receber ações (para a lista de escolha). */
export async function actionTargets(accountId: string) {
  const active = { accountId, missingSince: null, status: { notIn: ["ARCHIVED", "DELETED"] } };
  const sel = { externalId: true, name: true, status: true } as const;
  const [campaigns, adSets, ads] = await Promise.all([
    prisma.metaCampaign.findMany({
      where: active,
      select: { ...sel, dailyBudget: true },
      orderBy: { name: "asc" },
    }),
    prisma.metaAdSet.findMany({
      where: active,
      select: { ...sel, dailyBudget: true },
      orderBy: { name: "asc" },
    }),
    prisma.metaAd.findMany({ where: active, select: sel, orderBy: { name: "asc" } }),
  ]);
  return { campaigns, adSets, ads };
}

/** Prévia pelos dados sincronizados (nada é lido nem mudado na Meta). */
export async function previewAction(objectId: string, kind: TrafficActionKind, newBudget: number | null) {
  const { account } = await selectedAccount();
  if (!account) return null;
  const target = await localTarget(account.accountId, objectId);
  if (!target)
    return {
      target: null,
      result: { ok: false as const, message: "Item não encontrado. Atualize as campanhas." },
    };
  const [tree, settings] = await Promise.all([budgetTree(account.accountId), actionSettings()]);
  return { target, result: planTrafficAction({ target, kind, newBudget, tree, settings }) };
}

// ─── Manutenção ──────────────────────────────────────────────────────

/** Vence pedidos antigos e encerra execuções presas (ex.: servidor reiniciado no meio). */
async function housekeeping(now = new Date()) {
  await prisma.trafficAction.updateMany({
    where: { status: "PENDENTE", expiresAt: { lte: now } },
    data: { status: "EXPIRADA" },
  });
  const stale = new Date(now.getTime() - L.staleMinutes * 60_000);
  await prisma.trafficAction.updateMany({
    where: {
      status: "EXECUTANDO",
      OR: [{ decidedAt: { lt: stale } }, { decidedAt: null, requestedAt: { lt: stale } }],
    },
    data: {
      status: "FALHOU",
      error: "Interrompida antes de terminar. Confira na Meta se a mudança foi feita.",
    },
  });
}

// ─── Execução ────────────────────────────────────────────────────────

type ActionRow = Awaited<ReturnType<typeof prisma.trafficAction.findUniqueOrThrow>>;
type Conn = NonNullable<Awaited<ReturnType<typeof activeConnection>>>;

async function fail(row: ActionRow, actorId: string, message: string, detail?: string) {
  await prisma.trafficAction.update({ where: { id: row.id }, data: { status: "FALHOU", error: message } });
  await audit({
    actorId,
    action: "traffic.action_failed",
    entity: "TrafficAction",
    entityId: row.id,
    after: {
      item: row.objectId,
      acao: row.kind,
      motivo: message,
      ...(detail ? { detalhe: detail.slice(0, 300) } : {}),
    },
  });
  return { ok: false, message, id: row.id };
}

/** Faz a mudança na Meta (a linha já está EXECUTANDO e já foi conferida). */
async function execute(row: ActionRow, conn: Conn, actorId: string): Promise<ActionResult> {
  const writer = metaByName(conn.provider).write;
  const token = decrypt(conn.tokenEnc!);
  try {
    if (row.kind === "PAUSAR") await writer.setStatus(token, row.objectId, "PAUSED");
    else if (row.kind === "REATIVAR") await writer.setStatus(token, row.objectId, "ACTIVE");
    else await writer.setDailyBudget(token, row.objectId, row.toBudget!);
  } catch (e) {
    if (e instanceof MetaError) {
      console.error("Meta (ação):", e.detail);
      if (e.tokenInvalid)
        await prisma.metaConnection.update({
          where: { id: conn.id },
          data: {
            lastError: "A conexão venceu ou foi retirada na Meta. Conecte de novo.",
            lastCheckedAt: new Date(),
          },
        });
      return fail(row, actorId, `Nada foi mudado: ${e.message}`, e.detail);
    }
    console.error("Meta (ação):", e);
    return fail(row, actorId, "Nada foi confirmado pela Meta. Confira na Meta antes de tentar de novo.");
  }
  const now = new Date();
  await prisma.trafficAction.update({
    where: { id: row.id },
    data: { status: "EXECUTADA", executedAt: now },
  });
  await updateLocal(
    row.accountId,
    row.level,
    row.objectId,
    row.kind === "ORCAMENTO"
      ? { dailyBudget: row.toBudget }
      : { status: row.toStatus, effectiveStatus: row.toStatus },
  );
  await audit({
    actorId,
    action: "traffic.action_executed",
    entity: "TrafficAction",
    entityId: row.id,
    before: { status: row.fromStatus, orcamentoDiario: row.fromBudget },
    after: {
      item: row.objectId,
      nome: row.objectName,
      acao: describeTrafficAction(row),
      status: row.toStatus,
      orcamentoDiario: row.kind === "ORCAMENTO" ? row.toBudget : row.fromBudget,
      aumentaGasto: row.increasesSpend,
      pedidoPor: row.requestedById,
      aprovadoPor: row.decidedById,
    },
  });
  return {
    ok: true,
    message: `Feito na Meta: ${describeTrafficAction(row)} — ${row.objectName}.`,
    id: row.id,
  };
}

/** Lê o item na Meta e confere que é da conta escolhida. */
async function readFresh(conn: Conn, accountId: string, level: TrafficLevel, id: string) {
  const fresh = await metaByName(conn.provider).write.get(decrypt(conn.tokenEnc!), LEVEL_API[level], id);
  if (fresh.accountId !== accountId)
    throw new MetaError("Este item não pertence à conta de anúncios escolhida.", `conta ${fresh.accountId}`);
  return fresh;
}

async function guardConnection(): Promise<
  { ok: true; conn: Conn; accountId: string; isDemo: boolean } | { ok: false; message: string }
> {
  const { conn, account } = await selectedAccount();
  if (!conn?.tokenEnc || !account)
    return { ok: false, message: "Conecte a Meta e escolha a conta de anúncios primeiro." };
  if (missingMetaScopes(conn.scopes).includes("ads_management"))
    return {
      ok: false,
      message:
        "A conexão não tem a permissão de gerenciar anúncios. Conecte de novo e mantenha essa opção marcada.",
    };
  if (conn.lastError)
    return { ok: false, message: `A conexão com a Meta tem um problema: ${conn.lastError}` };
  return { ok: true, conn, accountId: account.accountId, isDemo: account.isDemo };
}

// ─── Pedir ───────────────────────────────────────────────────────────

export async function requestAction(
  userId: string,
  input: {
    objectId: string;
    kind: string;
    newBudget: number | null;
    reason: string;
    analysisId: string | null;
  },
): Promise<ActionResult> {
  if (!isTrafficActionKind(input.kind)) return { ok: false, message: "Ação inválida." };
  const reason = cleanText(input.reason, L.reasonMax);
  if (reason.length < L.reasonMin)
    return { ok: false, message: `Escreva o motivo (pelo menos ${L.reasonMin} letras): fica no histórico.` };
  const settings = await actionSettings();
  if (!settings.enabled) return { ok: false, message: DISABLED };
  const g = await guardConnection();
  if (!g.ok) return g;
  if (!(await rateLimit(`trafego-acao:${userId}`, L.perUserPerHour, 3600)))
    return { ok: false, message: "Muitas ações seguidas. Espere alguns minutos." };
  await housekeeping();

  const local = await localTarget(g.accountId, input.objectId);
  if (!local) return { ok: false, message: "Item não encontrado. Atualize as campanhas e tente de novo." };

  // Lê o item AGORA na Meta (a prévia usou os dados sincronizados).
  let fresh: MetaObjectState;
  try {
    fresh = await readFresh(g.conn, g.accountId, local.level, local.id);
  } catch (e) {
    if (e instanceof MetaError) console.error("Meta (ação/ler):", e.detail);
    return {
      ok: false,
      message: e instanceof MetaError ? e.message : "Não foi possível ler o item na Meta.",
    };
  }
  await updateLocal(g.accountId, local.level, local.id, fresh);
  const target: ActionTarget = {
    ...local,
    name: cleanText(fresh.name, 200) || local.name,
    status: fresh.status,
    dailyBudget: local.level === "ANUNCIO" ? null : fresh.dailyBudget,
    lifetimeBudget: local.level === "ANUNCIO" ? null : fresh.lifetimeBudget,
  };
  const tree = treeWith(await budgetTree(g.accountId), target);
  const planned = planTrafficAction({ target, kind: input.kind, newBudget: input.newBudget, tree, settings });
  if (!planned.ok) return planned;
  const p = planned.plan;

  let row: ActionRow;
  try {
    row = await prisma.trafficAction.create({
      data: {
        accountId: g.accountId,
        level: target.level,
        objectId: target.id,
        objectName: target.name,
        kind: p.kind,
        fromStatus: p.fromStatus,
        toStatus: p.toStatus,
        fromBudget: p.fromBudget,
        toBudget: p.toBudget,
        increasesSpend: p.increasesSpend,
        totalBefore: p.totalBefore,
        totalAfter: p.totalAfter,
        capCents: p.capCents,
        reason,
        analysisId: input.analysisId,
        status: p.increasesSpend ? "PENDENTE" : "EXECUTANDO",
        expiresAt: p.increasesSpend ? new Date(Date.now() + L.approvalHours * 3_600_000) : null,
        requestedById: userId,
        isDemo: g.isDemo,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, message: OPEN_EXISTS };
    throw e;
  }

  if (p.increasesSpend) {
    await audit({
      actorId: userId,
      action: "traffic.action_requested",
      entity: "TrafficAction",
      entityId: row.id,
      after: {
        item: row.objectId,
        nome: row.objectName,
        acao: describeTrafficAction(row),
        gastoDiarioAtivo: { antes: p.totalBefore, depois: p.totalAfter, teto: p.capCents },
        motivo: reason,
      },
    });
    return {
      ok: true,
      id: row.id,
      message: `Pedido enviado para aprovação: ${describeTrafficAction(row)} — ${row.objectName}. Outra pessoa com permissão de aprovar precisa confirmar em até ${L.approvalHours} horas.`,
    };
  }
  return execute(row, g.conn, userId);
}

// ─── Aprovar, recusar, cancelar ──────────────────────────────────────

export async function decideAction(
  userId: string,
  id: string,
  approve: boolean,
  note: string,
): Promise<ActionResult> {
  await housekeeping();
  const row = await prisma.trafficAction.findUnique({ where: { id } });
  if (!row) return { ok: false, message: "Pedido não encontrado." };
  const block = approvalBlock(row, userId, new Date());
  if (block) return { ok: false, message: block };
  const decisionNote = cleanText(note, 300) || null;

  if (!approve) {
    const r = await prisma.trafficAction.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "RECUSADA", decidedById: userId, decidedAt: new Date(), decisionNote },
    });
    if (!r.count) return { ok: false, message: "Este pedido não está mais aguardando aprovação." };
    await audit({
      actorId: userId,
      action: "traffic.action_rejected",
      entity: "TrafficAction",
      entityId: id,
      after: { item: row.objectId, acao: describeTrafficAction(row), observacao: decisionNote },
    });
    return { ok: true, message: "Pedido recusado. Nada foi mudado na Meta.", id };
  }

  const settings = await actionSettings();
  if (!settings.enabled) return { ok: false, message: DISABLED };
  const g = await guardConnection();
  if (!g.ok) return g;
  if (g.accountId !== row.accountId)
    return {
      ok: false,
      message: "A conta de anúncios escolhida mudou desde o pedido. Recuse e peça de novo.",
    };

  // Trava atômica: só um aprovador executa, uma vez.
  const claimed = await prisma.trafficAction.updateMany({
    where: { id, status: "PENDENTE", requestedById: { not: userId } },
    data: { status: "EXECUTANDO", decidedById: userId, decidedAt: new Date(), decisionNote },
  });
  if (!claimed.count) return { ok: false, message: "Este pedido não está mais aguardando aprovação." };
  const claimedRow = await prisma.trafficAction.findUniqueOrThrow({ where: { id } });
  await audit({
    actorId: userId,
    action: "traffic.action_approved",
    entity: "TrafficAction",
    entityId: id,
    after: {
      item: row.objectId,
      acao: describeTrafficAction(row),
      pedidoPor: row.requestedById,
      observacao: decisionNote,
    },
  });

  try {
    // Confere de novo na Meta: se o item mudou desde o pedido, nada é feito.
    const fresh = await readFresh(g.conn, g.accountId, row.level, row.objectId);
    await updateLocal(g.accountId, row.level, row.objectId, fresh);
    if (
      changedSinceRequest(row, {
        status: fresh.status,
        dailyBudget: row.level === "ANUNCIO" ? null : fresh.dailyBudget,
      })
    )
      return fail(
        claimedRow,
        userId,
        "O item mudou na Meta desde o pedido. Nada foi feito; peça de novo, se ainda fizer sentido.",
      );
    const target: ActionTarget = {
      level: row.level,
      id: row.objectId,
      name: row.objectName,
      status: fresh.status,
      dailyBudget: row.level === "ANUNCIO" ? null : fresh.dailyBudget,
      lifetimeBudget: row.level === "ANUNCIO" ? null : fresh.lifetimeBudget,
    };
    // Teto e gasto ativo de AGORA (podem ter mudado desde o pedido).
    const again = planTrafficAction({
      target,
      kind: row.kind,
      newBudget: row.toBudget,
      tree: treeWith(await budgetTree(g.accountId), target),
      settings,
    });
    if (!again.ok) return fail(claimedRow, userId, `Não aprovado pelas regras de agora: ${again.message}`);
    return await execute(claimedRow, g.conn, userId);
  } catch (e) {
    if (e instanceof MetaError) {
      console.error("Meta (aprovar):", e.detail);
      return fail(claimedRow, userId, `Nada foi mudado: ${e.message}`, e.detail);
    }
    await fail(claimedRow, userId, "Erro inesperado. Confira na Meta se a mudança foi feita.");
    throw e;
  }
}

/** Cancela um pedido pendente (quem pediu ou quem pode aprovar). */
export async function cancelAction(userId: string, id: string, canApprove: boolean): Promise<ActionResult> {
  const row = await prisma.trafficAction.findUnique({ where: { id } });
  if (!row || row.status !== "PENDENTE")
    return { ok: false, message: "Este pedido não está mais aguardando aprovação." };
  if (row.requestedById !== userId && !canApprove)
    return { ok: false, message: "Só quem pediu pode cancelar." };
  const r = await prisma.trafficAction.updateMany({
    where: { id, status: "PENDENTE" },
    data: { status: "CANCELADA", decidedById: userId, decidedAt: new Date() },
  });
  if (!r.count) return { ok: false, message: "Este pedido não está mais aguardando aprovação." };
  await audit({
    actorId: userId,
    action: "traffic.action_cancelled",
    entity: "TrafficAction",
    entityId: id,
    after: { item: row.objectId, acao: describeTrafficAction(row) },
  });
  return { ok: true, message: "Pedido cancelado.", id };
}

// ─── Listas ──────────────────────────────────────────────────────────

export async function listActions(accountId: string) {
  await housekeeping();
  const [pending, history] = await Promise.all([
    prisma.trafficAction.findMany({
      where: { accountId, status: "PENDENTE" },
      orderBy: { requestedAt: "asc" },
      take: 50,
    }),
    prisma.trafficAction.findMany({
      where: { accountId, status: { not: "PENDENTE" } },
      orderBy: { requestedAt: "desc" },
      take: 30,
    }),
  ]);
  const ids = [
    ...new Set([...pending, ...history].flatMap((a) => [a.requestedById, a.decidedById]).filter(Boolean)),
  ] as string[];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { pending, history, names };
}

/** Gasto diário ativo de agora (dados sincronizados), para a tela. */
export async function activeBudgetNow(accountId: string) {
  return activeDailyBudget(await budgetTree(accountId));
}

/** Resultado de uma ação para o aviso no topo da tela (só da conta escolhida). */
export async function actionOutcome(id: string, accountId: string): Promise<TrafficResult | null> {
  const a = await prisma.trafficAction.findFirst({ where: { id, accountId } });
  if (!a) return null;
  const what = `${describeTrafficAction(a)} — ${a.objectName}`;
  switch (a.status) {
    case "EXECUTADA":
      return { ok: true, message: `Feito na Meta: ${what}.` };
    case "PENDENTE":
      return {
        ok: true,
        message: `Pedido enviado para aprovação: ${what}. Outra pessoa com permissão de aprovar precisa confirmar em até ${L.approvalHours} horas.`,
      };
    case "RECUSADA":
      return { ok: true, message: `Pedido recusado. Nada foi mudado na Meta (${what}).` };
    case "CANCELADA":
      return { ok: true, message: `Pedido cancelado (${what}).` };
    case "FALHOU":
      return { ok: false, message: a.error ?? "A ação não foi feita." };
    default:
      return null;
  }
}
