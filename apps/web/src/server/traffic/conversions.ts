import "server-only";
import { createHash } from "node:crypto";
import {
  buildCapiEvent,
  buildFbc,
  CAPI_LIMITS,
  capiEventId,
  capiRetryAt,
  isDatasetId,
  isTestEventCode,
  missingMetaScopes,
  normalizeCapiSettings,
  withinCapiWindow,
  type CapiSettings,
} from "@prosed/core";
import { decrypt, prisma, type Prisma } from "@prosed/db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { activeConnection, type TrafficResult } from "./connection";
import { metaByName, MetaError } from "./index";

/**
 * API de Conversões da Meta (entrega 8.7).
 * - Desligada até alguém com `traffic:approve` informar o conjunto de dados (pixel) e ligar.
 * - Entram na fila só cadastros e vendas (1ª mensalidade paga) de quem chegou por um CLIQUE em
 *   anúncio da Meta (tem fbclid) nos últimos 7 dias — o prazo que a Meta aceita.
 * - Vai para a Meta o mínimo: evento, hora, código único, página de entrada, código do clique (fbc)
 *   e um identificador da pessoa com hash. Nada de nome, CPF, telefone ou e-mail.
 * - A fila não guarda dados pessoais; o envio é montado na hora. Se o código do clique foi apagado
 *   (90 dias ou pedido do titular), o evento não é enviado.
 * - Falha da Meta: tenta de novo (1, 4, 16, 64 min) até 5 vezes. A Meta também ignora repetidos (event_id).
 */

export const CAPI_SETTING_KEY = "traffic.capi";
const CASH_IN = ["CONFIRMADA", "RECEBIDA", "DUPLICADA", "ESTORNADA"] as const;
/** Trava curta para duas rotinas ao mesmo tempo não enviarem o mesmo evento. */
const LEASE_MS = 5 * 60_000;

/** Identificador da pessoa para a Meta: hash SHA-256 do ID interno (nunca dado pessoal). */
export const externalIdHash = (memberId: string) =>
  createHash("sha256").update(`prosed-membro:${memberId}`).digest("hex");

export async function capiSettings(): Promise<CapiSettings> {
  const s = await prisma.setting.findUnique({ where: { key: CAPI_SETTING_KEY } });
  return normalizeCapiSettings(s?.value);
}

export async function saveCapiSettings(
  userId: string,
  input: { enabled: boolean; datasetId: string; testEventCode: string },
): Promise<TrafficResult> {
  const datasetId = input.datasetId.trim();
  const testEventCode = input.testEventCode.trim();
  if (datasetId && !isDatasetId(datasetId))
    return { ok: false, message: "ID do conjunto de dados inválido: use só os números (8 a 25)." };
  if (testEventCode && !isTestEventCode(testEventCode))
    return {
      ok: false,
      message: "Código de teste inválido: copie do Gerenciador de Eventos (ex.: TEST12345).",
    };
  if (input.enabled && !datasetId)
    return { ok: false, message: "Informe o ID do conjunto de dados antes de ligar." };
  const before = await capiSettings();
  const value = {
    enabled: input.enabled,
    datasetId: datasetId || null,
    testEventCode: testEventCode || null,
  };
  await prisma.setting.upsert({
    where: { key: CAPI_SETTING_KEY },
    create: { key: CAPI_SETTING_KEY, value, description: "API de Conversões da Meta", updatedById: userId },
    update: { value, updatedById: userId },
  });
  await audit({
    actorId: userId,
    action: "traffic.capi_settings",
    entity: "Setting",
    entityId: CAPI_SETTING_KEY,
    before: { ...before },
    after: value,
  });
  return {
    ok: true,
    message: input.enabled ? "API de Conversões ligada." : "Configuração salva (desligada).",
  };
}

async function selected() {
  const conn = await activeConnection();
  return { conn, account: conn?.accounts.find((a) => a.selected) ?? null };
}

/** Põe na fila os cadastros e vendas novos (últimos 7 dias) de quem clicou num anúncio da Meta. */
export async function collectConversions(now = new Date()): Promise<number> {
  const settings = await capiSettings();
  const { account } = await selected();
  if (!settings.enabled || !account) return 0;
  const since = new Date(now.getTime() - CAPI_LIMITS.maxAgeMs);
  const memberWhere: Prisma.MemberWhereInput = {
    ...(account.isDemo ? {} : { isDemo: false }),
    attribution: { is: { fbclid: { not: null } } },
  };
  const [signups, joins] = await Promise.all([
    prisma.member.findMany({
      where: { ...memberWhere, createdAt: { gte: since } },
      select: { id: true, createdAt: true, attribution: { select: { campaignExternalId: true } } },
      take: 2000,
    }),
    prisma.subscriptionEvent.findMany({
      where: {
        fromStatus: "AGUARDANDO_PAGAMENTO",
        toStatus: "ATIVA",
        at: { gte: since },
        subscription: { member: memberWhere },
      },
      select: {
        id: true,
        at: true,
        subscription: {
          select: {
            memberId: true,
            member: { select: { attribution: { select: { campaignExternalId: true } } } },
            charges: {
              where: { status: { in: [...CASH_IN] }, paidAt: { not: null } },
              orderBy: { paidAt: "asc" },
              take: 1,
              select: { amount: true },
            },
          },
        },
      },
      take: 2000,
    }),
  ]);
  const rows: Prisma.MetaConversionEventCreateManyInput[] = [
    ...signups.map((m) => ({
      eventId: capiEventId("CADASTRO", m.id),
      kind: "CADASTRO" as const,
      memberId: m.id,
      eventTime: m.createdAt,
      valueCents: null,
      campaignExternalId: m.attribution?.campaignExternalId ?? null,
      isDemo: account.isDemo,
      nextAttemptAt: now,
    })),
    ...joins
      .filter((j) => j.subscription.charges.length)
      .map((j) => ({
        eventId: capiEventId("VENDA", j.id),
        kind: "VENDA" as const,
        memberId: j.subscription.memberId,
        eventTime: j.at,
        valueCents: j.subscription.charges[0]!.amount,
        campaignExternalId: j.subscription.member.attribution?.campaignExternalId ?? null,
        isDemo: account.isDemo,
        nextAttemptAt: now,
      })),
  ];
  if (!rows.length) return 0;
  const r = await prisma.metaConversionEvent.createMany({ data: rows, skipDuplicates: true });
  return r.count;
}

export type SendOutcome = { enviados: number; erros: number; descartados: number; motivo?: string };

/** Envia o que está na fila e já pode ser enviado. */
export async function sendConversions(now = new Date()): Promise<SendOutcome> {
  const out: SendOutcome = { enviados: 0, erros: 0, descartados: 0 };
  const settings = await capiSettings();
  if (!settings.enabled || !settings.datasetId) return { ...out, motivo: "desligada" };
  const { conn } = await selected();
  if (!conn?.tokenEnc) return { ...out, motivo: "sem conexão com a Meta" };
  if (conn.lastError) return { ...out, motivo: "a conexão com a Meta precisa ser refeita" };
  if (missingMetaScopes(conn.scopes).length) return { ...out, motivo: "faltam permissões na conexão" };

  const due = await prisma.metaConversionEvent.findMany({
    where: { status: { in: ["PENDENTE", "ERRO"] }, nextAttemptAt: { lte: now } },
    orderBy: { eventTime: "asc" },
    take: CAPI_LIMITS.batchSize,
  });
  if (!due.length) return out;
  // Trava: outra rotina rodando ao mesmo tempo não pega os mesmos eventos.
  const ids = due.map((e) => e.id);
  await prisma.metaConversionEvent.updateMany({
    where: { id: { in: ids } },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });

  const attrs = await prisma.memberAttribution.findMany({
    where: { memberId: { in: [...new Set(due.map((e) => e.memberId))] } },
    select: { memberId: true, fbclid: true, clickedAt: true, landingPath: true },
  });
  const byMember = new Map(attrs.map((a) => [a.memberId, a]));
  const site = (process.env.APP_URL ?? "http://localhost:3200").replace(/\/$/, "");

  const batch: { id: string; event: ReturnType<typeof buildCapiEvent> }[] = [];
  for (const e of due) {
    const a = byMember.get(e.memberId);
    const fbc = a ? buildFbc(a.fbclid, a.clickedAt) : null;
    const reason = !fbc
      ? "Sem o código do clique (apagado após 90 dias ou a pedido do titular)."
      : !withinCapiWindow(e.eventTime, now)
        ? "Passou de 7 dias: a Meta não aceita mais."
        : null;
    if (reason) {
      await prisma.metaConversionEvent.update({
        where: { id: e.id },
        data: { status: "DESCARTADO", lastError: reason },
      });
      out.descartados++;
      continue;
    }
    batch.push({
      id: e.id,
      event: buildCapiEvent({
        kind: e.kind,
        // Para a Meta vai o ID aleatório da linha da fila (o eventId interno contém IDs do sistema).
        eventId: e.id,
        eventTime: e.eventTime,
        sourceUrl: `${site}${a!.landingPath ?? "/"}`,
        fbc: fbc!,
        externalIdHash: externalIdHash(e.memberId),
        valueCents: e.valueCents,
      }),
    });
  }
  if (!batch.length) return out;

  try {
    await metaByName(conn.provider).conversions.send(
      decrypt(conn.tokenEnc),
      settings.datasetId,
      batch.map((b) => b.event),
      settings.testEventCode,
    );
    await prisma.metaConversionEvent.updateMany({
      where: { id: { in: batch.map((b) => b.id) } },
      data: {
        status: "ENVIADO",
        sentAt: now,
        lastError: null,
        testMode: !!settings.testEventCode,
        attempts: { increment: 1 },
      },
    });
    out.enviados = batch.length;
  } catch (e) {
    const message = e instanceof MetaError ? e.message : "Erro inesperado ao enviar.";
    if (e instanceof MetaError) {
      console.error("Meta (conversões):", e.detail);
      if (e.tokenInvalid)
        await prisma.metaConnection.update({
          where: { id: conn.id },
          data: {
            lastError: "A conexão venceu ou foi retirada na Meta. Conecte de novo.",
            lastCheckedAt: now,
          },
        });
    } else console.error("Meta (conversões):", e);
    for (const b of batch) {
      const ev = due.find((d) => d.id === b.id)!;
      const attempts = ev.attempts + 1;
      const retry = capiRetryAt(attempts, now);
      await prisma.metaConversionEvent.update({
        where: { id: b.id },
        data: {
          attempts,
          lastError: message,
          ...(retry ? { status: "ERRO", nextAttemptAt: retry } : { status: "DESCARTADO" }),
        },
      });
      if (retry) out.erros++;
      else out.descartados++;
    }
  }
  return out;
}

/** Rotina periódica: põe na fila e envia. */
export async function conversionsTick(now = new Date()) {
  const fila = await collectConversions(now);
  const envio = await sendConversions(now);
  return { fila, ...envio };
}

/** Botão "Enviar agora". */
export async function sendConversionsNow(userId: string): Promise<TrafficResult> {
  const settings = await capiSettings();
  if (!settings.enabled) return { ok: false, message: "A API de Conversões está desligada." };
  if (!(await rateLimit(`capi-enviar:${userId}`, 20, 3600)))
    return { ok: false, message: "Muitos envios seguidos. Espere alguns minutos." };
  const r = await conversionsTick();
  await audit({
    actorId: userId,
    action: "traffic.capi_sent",
    entity: "MetaConversionEvent",
    after: { ...r },
  });
  if (r.motivo) return { ok: false, message: `Nada foi enviado: ${r.motivo}.` };
  const parts = [`${r.enviados} enviado(s)`];
  if (r.erros) parts.push(`${r.erros} com erro (nova tentativa automática)`);
  if (r.descartados) parts.push(`${r.descartados} não enviado(s)`);
  return { ok: r.erros === 0, message: `${r.fila} novo(s) na fila. ${parts.join(", ")}.` };
}

/** Tudo o que a tela mostra (sem dados pessoais: nem nome, nem identificador). */
export async function conversionsOverview(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [settings, counts, recent] = await Promise.all([
    capiSettings(),
    prisma.metaConversionEvent.groupBy({
      by: ["status", "kind"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.metaConversionEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        eventTime: true,
        valueCents: true,
        campaignExternalId: true,
        status: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        testMode: true,
        isDemo: true,
      },
    }),
  ]);
  const count = (status: string, kind?: string) =>
    counts
      .filter((c) => c.status === status && (!kind || c.kind === kind))
      .reduce((s, c) => s + c._count._all, 0);
  return { settings, count, recent };
}
