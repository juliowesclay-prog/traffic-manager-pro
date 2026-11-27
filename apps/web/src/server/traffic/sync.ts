import "server-only";
import {
  isMetaSyncInterval,
  META_DEFAULT_INTERVAL,
  shouldAutoSync,
  syncWindow,
  type MetaSyncInterval,
} from "@prosed/core";
import { decrypt, prisma, type Prisma } from "@prosed/db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { activeConnection, type TrafficResult } from "./connection";
import { metaByName, MetaError } from "./index";
import type { MetaInsightLevel, MetaInsightRow } from "./meta-gateway";

/**
 * Sincronização dos anúncios da conta escolhida (entrega 8.2). SOMENTE LEITURA na Meta.
 * - Uma execução por conta de cada vez (índice no banco); execução parada há mais de 15 min é encerrada.
 * - Idempotente: rodar de novo atualiza as mesmas linhas, nunca duplica.
 * - Resultados: primeira vez 90 dias; depois os últimos 7 (a Meta ajusta resultados recentes).
 * - Falha na Meta: nada já salvo se perde; a execução fica marcada com a mensagem segura.
 */

export const SYNC_SETTING_KEY = "traffic.sync";
const STALE_MS = 15 * 60_000;
const LEVELS: [MetaInsightLevel, "CAMPANHA" | "CONJUNTO" | "ANUNCIO"][] = [
  ["campaign", "CAMPANHA"],
  ["adset", "CONJUNTO"],
  ["ad", "ANUNCIO"],
];

export async function syncSettings(): Promise<{ intervalMinutes: MetaSyncInterval }> {
  const s = await prisma.setting.findUnique({ where: { key: SYNC_SETTING_KEY } });
  const v = Number((s?.value as { intervalMinutes?: unknown } | null)?.intervalMinutes);
  return { intervalMinutes: s && isMetaSyncInterval(v) ? v : META_DEFAULT_INTERVAL };
}

export async function saveSyncInterval(userId: string, minutes: number): Promise<TrafficResult> {
  if (!isMetaSyncInterval(minutes)) return { ok: false, message: "Intervalo inválido." };
  await prisma.setting.upsert({
    where: { key: SYNC_SETTING_KEY },
    create: {
      key: SYNC_SETTING_KEY,
      value: { intervalMinutes: minutes },
      description: "Atualização dos anúncios",
      updatedById: userId,
    },
    update: { value: { intervalMinutes: minutes }, updatedById: userId },
  });
  await audit({
    actorId: userId,
    action: "traffic.sync_interval_changed",
    entity: "Setting",
    entityId: SYNC_SETTING_KEY,
    after: { intervalMinutes: minutes },
  });
  return { ok: true, message: "Intervalo de atualização salvo." };
}

const dbDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
const chunk = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export type SyncOutcome =
  | { ok: true; runId: string; counts: Record<string, number> }
  | { ok: false; message: string; runId?: string };

export async function runSync(
  trigger: "MANUAL" | "AUTOMATICA",
  actorId: string | null,
  now = new Date(),
): Promise<SyncOutcome> {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected);
  if (!conn?.tokenEnc || !account)
    return { ok: false, message: "Conecte a Meta e escolha a conta de anúncios primeiro." };
  const accountId = account.accountId;

  // Libera uma execução que ficou presa (ex.: servidor reiniciado no meio).
  await prisma.metaSyncRun.updateMany({
    where: { accountId, status: "EXECUTANDO", startedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    data: { status: "ERRO", error: "Interrompida antes de terminar.", finishedAt: now },
  });
  // Primeira vez (sem nenhuma sincronização completa desta conta) busca o histórico.
  const firstTime = !(await prisma.metaSyncRun.findFirst({
    where: { accountId, status: "OK" },
    select: { id: true },
  }));
  const { since, until } = syncWindow(now, account.timezone, firstTime);
  const run = await prisma.metaSyncRun
    .create({
      data: {
        accountId,
        trigger,
        since: dbDay(since),
        until: dbDay(until),
        startedById: actorId,
        startedAt: now,
      },
    })
    .catch(() => null);
  if (!run) return { ok: false, message: "Já há uma atualização em andamento. Aguarde terminar." };

  const isDemo = account.isDemo;
  const counts: Record<string, number> = {};
  let structureDone = false;
  try {
    const meta = metaByName(conn.provider);
    const token = decrypt(conn.tokenEnc);

    // 1) Estrutura: tudo é lido antes de gravar.
    const campaigns = await meta.read.campaigns(token, accountId);
    const adSets = await meta.read.adSets(token, accountId);
    const ads = await meta.read.ads(token, accountId);
    const stamp = new Date();

    for (const part of chunk(campaigns, 100))
      await prisma.$transaction(
        part.map(({ id, ...c }) => {
          const data = { ...c, name: c.name.slice(0, 400), isDemo, syncedAt: stamp, missingSince: null };
          return prisma.metaCampaign.upsert({
            where: { accountId_externalId: { accountId, externalId: id } },
            create: { accountId, externalId: id, ...data },
            update: data,
          });
        }),
      );
    for (const part of chunk(adSets, 100))
      await prisma.$transaction(
        part.map(({ id, campaignId, ...a }) => {
          const data = {
            ...a,
            campaignExternalId: campaignId,
            name: a.name.slice(0, 400),
            isDemo,
            syncedAt: stamp,
            missingSince: null,
          };
          return prisma.metaAdSet.upsert({
            where: { accountId_externalId: { accountId, externalId: id } },
            create: { accountId, externalId: id, ...data },
            update: data,
          });
        }),
      );
    const creatives = new Map(ads.flatMap((a) => (a.creative ? [[a.creative.id, a.creative] as const] : [])));
    for (const part of chunk([...creatives.values()], 100))
      await prisma.$transaction(
        part.map(({ id, ...c }) => {
          const data = {
            ...c,
            title: c.title?.slice(0, 500) ?? null,
            body: c.body?.slice(0, 4000) ?? null,
            isDemo,
            syncedAt: stamp,
          };
          return prisma.metaCreative.upsert({
            where: { accountId_externalId: { accountId, externalId: id } },
            create: { accountId, externalId: id, ...data },
            update: data,
          });
        }),
      );
    for (const part of chunk(ads, 100))
      await prisma.$transaction(
        part.map((a) => {
          const data = {
            adSetExternalId: a.adSetId,
            campaignExternalId: a.campaignId,
            creativeExternalId: a.creative?.id ?? null,
            name: a.name.slice(0, 400),
            status: a.status,
            effectiveStatus: a.effectiveStatus,
            isDemo,
            syncedAt: stamp,
            missingSince: null,
          };
          return prisma.metaAd.upsert({
            where: { accountId_externalId: { accountId, externalId: a.id } },
            create: { accountId, externalId: a.id, ...data },
            update: data,
          });
        }),
      );
    // O que não veio mais é marcado (não apagado).
    const gone = { accountId, syncedAt: { lt: stamp }, missingSince: null };
    await prisma.$transaction([
      prisma.metaCampaign.updateMany({ where: gone, data: { missingSince: stamp } }),
      prisma.metaAdSet.updateMany({ where: gone, data: { missingSince: stamp } }),
      prisma.metaAd.updateMany({ where: gone, data: { missingSince: stamp } }),
    ]);
    Object.assign(counts, {
      campanhas: campaigns.length,
      conjuntos: adSets.length,
      anuncios: ads.length,
      criativos: creatives.size,
    });
    structureDone = true;

    // 2) Resultados por nível: substitui a janela buscada, numa transação por nível.
    for (const [level, dbLevel] of LEVELS) {
      const rows = await meta.read.insights(token, accountId, level, since, until);
      const inWindow = rows.filter((r: MetaInsightRow) => r.date >= since && r.date <= until);
      const data: Prisma.MetaInsightDailyCreateManyInput[] = inWindow.map(({ date, actions, ...r }) => ({
        ...r,
        accountId,
        level: dbLevel,
        date: dbDay(date),
        actions: actions as unknown as Prisma.InputJsonValue,
        isDemo,
        syncedAt: new Date(),
      }));
      await prisma.$transaction([
        prisma.metaInsightDaily.deleteMany({
          where: { accountId, level: dbLevel, date: { gte: dbDay(since), lte: dbDay(until) } },
        }),
        ...chunk(data, 1000).map((part) => prisma.metaInsightDaily.createMany({ data: part })),
      ]);
      counts[`resultados_${level}`] = data.length;
    }

    await prisma.metaSyncRun.update({
      where: { id: run.id },
      data: { status: "OK", counts, finishedAt: new Date() },
    });
    await prisma.metaConnection.update({
      where: { id: conn.id },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
    return { ok: true, runId: run.id, counts };
  } catch (e) {
    const message = e instanceof MetaError ? e.message : "Não foi possível atualizar os anúncios agora.";
    console.error("Meta (sincronizar):", e instanceof MetaError ? e.detail : e);
    await prisma.metaSyncRun.update({
      where: { id: run.id },
      data: { status: structureDone ? "PARCIAL" : "ERRO", counts, error: message, finishedAt: new Date() },
    });
    if (e instanceof MetaError && e.tokenInvalid)
      await prisma.metaConnection.update({
        where: { id: conn.id },
        data: {
          lastError: "A conexão venceu ou foi retirada na Meta. Conecte de novo.",
          lastCheckedAt: new Date(),
        },
      });
    return { ok: false, message, runId: run.id };
  }
}

/** Botão "Atualizar agora": limite por hora e registro na auditoria. */
export async function manualSync(userId: string): Promise<TrafficResult> {
  if (!(await rateLimit(`meta-sync:${userId}`, 12, 3600)))
    return { ok: false, message: "Muitas atualizações seguidas. Espere alguns minutos." };
  const r = await runSync("MANUAL", userId);
  if (r.runId)
    await audit({
      actorId: userId,
      action: "traffic.sync_manual",
      entity: "MetaSyncRun",
      entityId: r.runId,
      after: r.ok ? r.counts : { erro: r.message },
    });
  return r.ok
    ? {
        ok: true,
        message: `Atualizado: ${r.counts.campanhas} campanha(s), ${r.counts.conjuntos} conjunto(s) e ${r.counts.anuncios} anúncio(s).`,
      }
    : { ok: false, message: r.message };
}

/** Chamada pela rotina periódica: atualiza se já passou o intervalo desde a última tentativa. */
export async function autoSyncIfDue(now = new Date()): Promise<"atualizado" | "erro" | "nao_era_hora"> {
  const conn = await activeConnection();
  const account = conn?.accounts.find((a) => a.selected);
  if (!conn || !account) return "nao_era_hora";
  if (conn.lastError) return "nao_era_hora"; // precisa de ação humana (reconectar)
  const { intervalMinutes } = await syncSettings();
  const last = await prisma.metaSyncRun.findFirst({
    where: { accountId: account.accountId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (!shouldAutoSync(last?.startedAt ?? null, intervalMinutes, now)) return "nao_era_hora";
  const r = await runSync("AUTOMATICA", null, now);
  return r.ok ? "atualizado" : "erro";
}
