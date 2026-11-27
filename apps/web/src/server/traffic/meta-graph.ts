import "server-only";
import { createHmac } from "node:crypto";
import {
  metaAuthorizeUrl,
  metaCount,
  metaDecimalToCents,
  metaMinorUnits,
  META_RESULT_TYPES,
  pickAction,
  targetingSummary,
  type MetaAction,
} from "@prosed/core";
import {
  MetaError,
  type MetaAccountInfo,
  type MetaAdsWriter,
  type MetaConversionsSender,
  type MetaGateway,
  type MetaInsightRow,
} from "./meta-gateway";

/**
 * Meta Marketing API (graph.facebook.com). Toda chamada com a chave do usuário leva o appsecret_proof
 * (HMAC da chave com o segredo do app): uma chave vazada não funciona fora do nosso servidor.
 * Endereços com chaves e segredos nunca são registrados em log.
 */

const version = () => process.env.META_GRAPH_VERSION || "v24.0";
const appId = () => process.env.META_APP_ID ?? "";
const appSecret = () => process.env.META_APP_SECRET ?? "";
const graph = (path: string) => `https://graph.facebook.com/${version()}${path}`;
const proof = (token: string) => createHmac("sha256", appSecret()).update(token).digest("hex");

function config() {
  if (!/^\d{5,25}$/.test(appId()) || appSecret().length < 24)
    throw new MetaError(
      "A integração com a Meta não está configurada.",
      "META_APP_ID/META_APP_SECRET ausentes",
    );
}

type GraphError = { error?: { message?: string; type?: string; code?: number; fbtrace_id?: string } };

async function call<T>(
  method: "GET" | "DELETE" | "POST",
  path: string,
  params: Record<string, string>,
): Promise<T> {
  config();
  // POST leva os parâmetros no corpo (a chave não fica no endereço).
  const qs = new URLSearchParams(params).toString();
  const url = method === "POST" ? graph(path) : `${graph(path)}?${qs}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      ...(method === "POST"
        ? { body: qs, headers: { "content-type": "application/x-www-form-urlencoded" } }
        : {}),
    });
  } catch (error) {
    throw new MetaError(
      "A Meta não respondeu. Tente de novo em instantes.",
      `${method} ${path}: ${String(error)}`,
    );
  }
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    // A mensagem da Meta não vai para a tela (pode trazer detalhes internos); só código e rastreio.
    const detail = `${method} ${path} → ${res.status} code=${e.code ?? "?"} type=${e.type ?? "?"} trace=${e.fbtrace_id ?? "?"}`;
    if (e.code === 190)
      throw new MetaError("A conexão com a Meta venceu ou foi retirada. Conecte de novo.", detail, true);
    if (e.code === 4 || e.code === 17 || e.code === 613)
      throw new MetaError("A Meta limitou as consultas por agora. Tente de novo em alguns minutos.", detail);
    throw new MetaError("A Meta recusou a operação.", detail);
  }
  return body;
}

const withToken = (token: string, extra: Record<string, string> = {}) => ({
  access_token: token,
  appsecret_proof: proof(token),
  ...extra,
});
const expiresFrom = (seconds: unknown) =>
  typeof seconds === "number" && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null;

/** Máximo de páginas por consulta (com limit=200 → 40 mil itens). Passou disso: avisa em vez de cortar. */
const MAX_PAGES = 200;

type Page<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

async function all<T>(token: string, path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await call<Page<T>>("GET", path, withToken(token, { ...params, ...(after ? { after } : {}) }));
    out.push(...(r.data ?? []));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) return out;
  }
  throw new MetaError(
    "A conta tem dados demais para uma sincronização de uma vez.",
    `${path}: paginação excedida`,
  );
}

const date = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
/** Inclui arquivadas (para manter o histórico); excluídas não são consultáveis e viram "encerradas". */
const STATUSES = JSON.stringify([
  "ACTIVE",
  "PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "ARCHIVED",
  "IN_PROCESS",
  "WITH_ISSUES",
]);

const reader: MetaGateway["read"] = {
  async campaigns(token, accountId) {
    const rows = await all<Record<string, string>>(token, `/${accountId}/campaigns`, {
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time",
      effective_status: STATUSES,
      limit: "200",
    });
    return rows.map((c) => ({
      id: c.id!,
      name: c.name ?? c.id!,
      objective: c.objective ?? null,
      status: c.status ?? "UNKNOWN",
      effectiveStatus: c.effective_status ?? c.status ?? "UNKNOWN",
      dailyBudget: metaMinorUnits(c.daily_budget),
      lifetimeBudget: metaMinorUnits(c.lifetime_budget),
      budgetRemaining: metaMinorUnits(c.budget_remaining),
      startTime: date(c.start_time),
      stopTime: date(c.stop_time),
    }));
  },

  async adSets(token, accountId) {
    const rows = await all<Record<string, unknown>>(token, `/${accountId}/adsets`, {
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time,targeting",
      effective_status: STATUSES,
      limit: "200",
    });
    const s = (v: unknown) => (typeof v === "string" ? v : undefined);
    return rows.map((a) => ({
      id: String(a.id),
      campaignId: String(a.campaign_id),
      name: s(a.name) ?? String(a.id),
      status: s(a.status) ?? "UNKNOWN",
      effectiveStatus: s(a.effective_status) ?? "UNKNOWN",
      dailyBudget: metaMinorUnits(a.daily_budget),
      lifetimeBudget: metaMinorUnits(a.lifetime_budget),
      optimizationGoal: s(a.optimization_goal) ?? null,
      targetingSummary: targetingSummary(a.targeting),
      startTime: date(s(a.start_time)),
      endTime: date(s(a.end_time)),
    }));
  },

  async ads(token, accountId) {
    const rows = await all<{
      id: string;
      name?: string;
      adset_id: string;
      campaign_id: string;
      status?: string;
      effective_status?: string;
      creative?: Record<string, string>;
    }>(token, `/${accountId}/ads`, {
      fields:
        "id,name,adset_id,campaign_id,status,effective_status,creative{id,name,title,body,call_to_action_type,object_type,thumbnail_url}",
      effective_status: STATUSES,
      limit: "100",
    });
    return rows.map((a) => ({
      id: a.id,
      adSetId: a.adset_id,
      campaignId: a.campaign_id,
      name: a.name ?? a.id,
      status: a.status ?? "UNKNOWN",
      effectiveStatus: a.effective_status ?? "UNKNOWN",
      creative: a.creative?.id
        ? {
            id: a.creative.id,
            name: a.creative.name ?? null,
            title: a.creative.title ?? null,
            body: a.creative.body ?? null,
            callToAction: a.creative.call_to_action_type ?? null,
            objectType: a.creative.object_type ?? null,
            thumbnailUrl: a.creative.thumbnail_url ?? null,
          }
        : null,
    }));
  },

  async insights(token, accountId, level, since, until) {
    const rows = await all<
      Record<string, unknown> & { actions?: MetaAction[]; action_values?: MetaAction[] }
    >(token, `/${accountId}/insights`, {
      level,
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields:
        "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
      limit: "500",
    });
    const key = level === "campaign" ? "campaign_id" : level === "adset" ? "adset_id" : "ad_id";
    return rows.map((r): MetaInsightRow => ({
      objectId: String(r[key]),
      date: String(r.date_start),
      spend: metaDecimalToCents(r.spend),
      impressions: metaCount(r.impressions),
      reach: metaCount(r.reach),
      clicks: metaCount(r.clicks),
      linkClicks: metaCount(r.inline_link_clicks),
      landingViews: metaCount(pickAction(r.actions, META_RESULT_TYPES.landingViews)),
      leads: metaCount(pickAction(r.actions, META_RESULT_TYPES.leads)),
      registrations: metaCount(pickAction(r.actions, META_RESULT_TYPES.registrations)),
      conversations: metaCount(pickAction(r.actions, META_RESULT_TYPES.conversations)),
      purchases: metaCount(pickAction(r.actions, META_RESULT_TYPES.purchases)),
      purchaseValue: metaDecimalToCents(pickAction(r.action_values, META_RESULT_TYPES.purchases)),
      actions: (r.actions ?? []).slice(0, 60),
    }));
  },
};

/** Escrita (8.6). Cada chamada muda UM item; quem decide se pode é o serviço de ações. */
const writer: MetaAdsWriter = {
  async get(token, level, id) {
    if (!/^\d{1,30}$/.test(id)) throw new MetaError("Item inválido.", `id=${id}`);
    const fields =
      level === "ad"
        ? "id,name,account_id,status,effective_status"
        : "id,name,account_id,status,effective_status,daily_budget,lifetime_budget";
    const r = await call<Record<string, string>>("GET", `/${id}`, withToken(token, { fields }));
    return {
      id: r.id ?? id,
      accountId: `act_${r.account_id ?? ""}`,
      name: r.name ?? id,
      status: r.status ?? "UNKNOWN",
      effectiveStatus: r.effective_status ?? r.status ?? "UNKNOWN",
      dailyBudget: metaMinorUnits(r.daily_budget),
      lifetimeBudget: metaMinorUnits(r.lifetime_budget),
    };
  },

  async setStatus(token, id, status) {
    if (!/^\d{1,30}$/.test(id)) throw new MetaError("Item inválido.", `id=${id}`);
    const r = await call<{ success?: boolean }>("POST", `/${id}`, withToken(token, { status }));
    if (r.success === false)
      throw new MetaError("A Meta recusou a operação.", `POST /${id} status: success=false`);
  },

  async setDailyBudget(token, id, cents) {
    if (!/^\d{1,30}$/.test(id) || !Number.isInteger(cents) || cents < 100)
      throw new MetaError("Valor inválido.", `id=${id} cents=${cents}`);
    const r = await call<{ success?: boolean }>(
      "POST",
      `/${id}`,
      withToken(token, { daily_budget: String(cents) }),
    );
    if (r.success === false)
      throw new MetaError("A Meta recusou a operação.", `POST /${id} daily_budget: success=false`);
  },
};

/** API de Conversões (8.7): POST /{conjunto de dados}/events, parâmetros no corpo. */
const conversions: MetaConversionsSender = {
  async send(token, datasetId, events, testEventCode) {
    if (!/^\d{8,25}$/.test(datasetId))
      throw new MetaError("Conjunto de dados inválido.", `dataset=${datasetId}`);
    const r = await call<{ events_received?: number }>(
      "POST",
      `/${datasetId}/events`,
      withToken(token, {
        data: JSON.stringify(events),
        ...(testEventCode ? { test_event_code: testEventCode } : {}),
      }),
    );
    return { received: Number(r.events_received ?? 0) };
  },
};

export const metaGraphGateway: MetaGateway = {
  read: reader,
  write: writer,
  conversions,
  name: "meta",

  authorizeUrl(state, redirectUri) {
    config();
    return metaAuthorizeUrl({
      graphVersion: version(),
      appId: appId(),
      redirectUri,
      state,
      configId: process.env.META_LOGIN_CONFIG_ID || undefined,
    });
  },

  async exchangeCode(code, redirectUri) {
    const short = await call<{ access_token: string }>("GET", "/oauth/access_token", {
      client_id: appId(),
      client_secret: appSecret(),
      redirect_uri: redirectUri,
      code,
    });
    // Chave de longa duração (cerca de 60 dias).
    const long = await call<{ access_token: string; expires_in?: number }>("GET", "/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId(),
      client_secret: appSecret(),
      fb_exchange_token: short.access_token,
    });
    return { token: long.access_token, expiresAt: expiresFrom(long.expires_in) };
  },

  async inspectToken(token) {
    const r = await call<{
      data?: { is_valid?: boolean; app_id?: string; scopes?: string[]; expires_at?: number };
    }>("GET", "/debug_token", { input_token: token, access_token: `${appId()}|${appSecret()}` });
    const d = r.data ?? {};
    // A chave precisa ser do NOSSO app (impede trocar por uma chave de outro app).
    const ours = String(d.app_id ?? "") === appId();
    return {
      valid: !!d.is_valid && ours,
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
      expiresAt: d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000) : null,
    };
  },

  async me(token) {
    const r = await call<{ id: string; name?: string }>(
      "GET",
      "/me",
      withToken(token, { fields: "id,name" }),
    );
    return { id: r.id, name: r.name ?? "Usuário da Meta" };
  },

  async adAccounts(token) {
    const out: MetaAccountInfo[] = [];
    let after: string | undefined;
    // Até 500 contas (5 páginas de 100), mais que suficiente para uma empresa.
    for (let page = 0; page < 5; page++) {
      const r = await call<{
        data?: {
          id: string;
          name?: string;
          currency?: string;
          timezone_name?: string;
          account_status?: number;
          business?: { name?: string };
        }[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>(
        "GET",
        "/me/adaccounts",
        withToken(token, {
          fields: "id,name,currency,timezone_name,account_status,business{name}",
          limit: "100",
          ...(after ? { after } : {}),
        }),
      );
      for (const a of r.data ?? [])
        out.push({
          accountId: a.id,
          name: a.name ?? a.id,
          currency: a.currency ?? "BRL",
          timezone: a.timezone_name ?? "America/Sao_Paulo",
          accountStatus: a.account_status ?? 0,
          businessName: a.business?.name ?? null,
        });
      after = r.paging?.next ? r.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  },

  async revoke(token) {
    await call("DELETE", "/me/permissions", withToken(token));
  },
};
