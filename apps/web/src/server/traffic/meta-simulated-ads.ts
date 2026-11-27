import "server-only";
import { createHash } from "node:crypto";
import { addDays } from "@prosed/core";
import { prisma, type Prisma } from "@prosed/db";
import {
  MetaError,
  type MetaAdsReader,
  type MetaAdsWriter,
  type MetaConversionsSender,
  type MetaInsightRow,
  type MetaObjectState,
} from "./meta-gateway";

/**
 * Anúncios SIMULADOS (DEMO) — somente desenvolvimento. Números inventados mas estáveis (mesmo dia e
 * anúncio = mesmo número), para testar a sincronização sem credenciais. Nunca usados em produção.
 */

/** Falha injetada para testes: Setting "simulado.meta.falhas" = { metodos: ["insights"], token?: true }. */
export const SIMULATED_META_FAILURE_KEY = "simulado.meta.falhas";
async function guard(op: string) {
  if (process.env.APP_ENV === "production")
    throw new MetaError("A Meta simulada não pode ser usada em produção.");
  const cfg = await prisma.setting.findUnique({ where: { key: SIMULATED_META_FAILURE_KEY } });
  const v = cfg?.value as { metodos?: string[]; token?: boolean } | null | undefined;
  if (v?.metodos?.includes(op))
    throw new MetaError(
      v.token
        ? "A conexão com a Meta venceu ou foi retirada. Conecte de novo."
        : "A Meta não respondeu. Tente de novo em instantes.",
      `simulado: falha injetada em ${op}`,
      !!v.token,
    );
}

/**
 * Mudanças feitas pelas ações (8.6) na Meta simulada: Setting "simulado.meta.estado" =
 * { [id]: { status?, daily? } }. Apagar a chave volta tudo ao estado inicial. Os resultados diários
 * (insights) continuam os mesmos — só a situação e o orçamento mudam.
 */
export const SIMULATED_META_STATE_KEY = "simulado.meta.estado";
type Overrides = Record<string, { status?: string; daily?: number }>;
async function loadState(): Promise<Overrides> {
  const s = await prisma.setting.findUnique({ where: { key: SIMULATED_META_STATE_KEY } });
  return (s?.value as Overrides | null) ?? {};
}
async function saveState(id: string, patch: { status?: string; daily?: number }) {
  const cur = await loadState();
  const value = { ...cur, [id]: { ...cur[id], ...patch } };
  await prisma.setting.upsert({
    where: { key: SIMULATED_META_STATE_KEY },
    create: { key: SIMULATED_META_STATE_KEY, value, description: "DEMO: estado da Meta simulada" },
    update: { value },
  });
}
export const SIMULATED_ACCOUNT_ID = "act_1000000000000001";

/** Situação de cada item com as mudanças aplicadas. */
function current(ov: Overrides) {
  const camp = (c: (typeof CAMPAIGNS)[number]) => ({
    status: ov[c.id]?.status ?? c.status,
    daily: ov[c.id]?.daily ?? c.daily,
  });
  const set = (s: ReturnType<typeof adSets>[number]) => {
    const status = ov[s.id]?.status ?? (s.campaign.status === "ACTIVE" ? "ACTIVE" : "PAUSED");
    const cs = camp(s.campaign).status;
    return {
      status,
      effective: status !== "ACTIVE" ? status : cs !== "ACTIVE" ? "CAMPAIGN_PAUSED" : "ACTIVE",
    };
  };
  const ad = (a: ReturnType<typeof ads>[number]) => {
    const status = ov[a.id]?.status ?? (a.set.campaign.status === "ACTIVE" ? "ACTIVE" : "PAUSED");
    const cs = camp(a.set.campaign).status;
    const ss = set(a.set).status;
    return {
      status,
      effective:
        status !== "ACTIVE"
          ? status
          : cs !== "ACTIVE"
            ? "CAMPAIGN_PAUSED"
            : ss !== "ACTIVE"
              ? "ADSET_PAUSED"
              : "ACTIVE",
    };
  };
  return { camp, set, ad };
}

const seed = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0);

const CAMPAIGNS = [
  {
    id: "2380000000000001",
    name: "DEMO Vendas — Cartão do Trabalhador",
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    daily: 5000,
    weight: 1,
  },
  {
    id: "2380000000000002",
    name: "DEMO Cadastros — WhatsApp",
    objective: "OUTCOME_LEADS",
    status: "PAUSED",
    daily: 2000,
    weight: 0.4,
  },
  {
    id: "2380000000000003",
    name: "DEMO Lançamento (encerrada)",
    objective: "OUTCOME_TRAFFIC",
    status: "ARCHIVED",
    daily: 3000,
    weight: 0.6,
  },
];
const SET_NAMES = ["Londrina 25–65", "Interesses saúde"];
const AD_NAMES = ["Vídeo depoimento", "Imagem preço"];

const adSets = () =>
  CAMPAIGNS.flatMap((c, ci) =>
    SET_NAMES.map((n, si) => ({
      id: `23810000000000${ci}${si}`,
      campaign: c,
      name: `DEMO ${n}`,
    })),
  );
const ads = () =>
  adSets().flatMap((s, i) =>
    AD_NAMES.map((n, ai) => ({
      id: `238200000000${String(i).padStart(2, "0")}${ai}`,
      set: s,
      name: `DEMO ${n}`,
      ai,
    })),
  );

/** Resultado de um anúncio num dia. Pausada/arquivada: sem entrega nos últimos dias. */
function adDay(
  adId: string,
  campaign: (typeof CAMPAIGNS)[number],
  day: string,
  today: string,
): MetaInsightRow | null {
  if (campaign.status === "PAUSED" && day > addDays(today, -3)) return null;
  if (campaign.status === "ARCHIVED" && day > addDays(today, -40)) return null;
  const r = seed(`${adId}:${day}`);
  const spend = Math.round(((campaign.daily / 4) * (60 + (r % 80))) / 100);
  const impressions = Math.round(spend * (3 + (r % 5) / 2));
  const linkClicks = Math.round((impressions * (8 + (r % 20))) / 1000);
  const leads = campaign.objective === "OUTCOME_LEADS" ? Math.floor(linkClicks / (6 + (r % 5))) : 0;
  const purchases = campaign.objective === "OUTCOME_SALES" ? Math.floor(linkClicks / (25 + (r % 20))) : 0;
  const landingViews = Math.round(linkClicks * 0.8);
  return {
    objectId: adId,
    date: day,
    spend,
    impressions,
    reach: Math.round(impressions * 0.7),
    clicks: Math.round(linkClicks * 1.3),
    linkClicks,
    landingViews,
    leads,
    registrations: 0,
    conversations: campaign.objective === "OUTCOME_LEADS" ? Math.floor(leads / 2) : 0,
    purchases,
    purchaseValue: purchases * 3990,
    actions: [
      { action_type: "link_click", value: linkClicks },
      { action_type: "landing_page_view", value: landingViews },
      ...(purchases ? [{ action_type: "omni_purchase", value: purchases }] : []),
      ...(leads ? [{ action_type: "lead", value: leads }] : []),
    ],
  };
}

const SUM = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "linkClicks",
  "landingViews",
  "leads",
  "registrations",
  "conversations",
  "purchases",
  "purchaseValue",
] as const;

export const simulatedReader: MetaAdsReader = {
  async campaigns() {
    await guard("campaigns");
    const now = Date.now();
    const cur = current(await loadState());
    return CAMPAIGNS.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: cur.camp(c).status,
      effectiveStatus: cur.camp(c).status,
      dailyBudget: cur.camp(c).daily,
      lifetimeBudget: null,
      budgetRemaining: Math.round(cur.camp(c).daily * 0.4),
      startTime: new Date(now - 120 * 86_400_000),
      stopTime: c.status === "ARCHIVED" ? new Date(now - 40 * 86_400_000) : null,
    }));
  },

  async adSets() {
    await guard("adSets");
    const cur = current(await loadState());
    return adSets().map((s) => ({
      id: s.id,
      campaignId: s.campaign.id,
      name: s.name,
      status: cur.set(s).status,
      effectiveStatus: cur.set(s).effective,
      dailyBudget: null,
      lifetimeBudget: null,
      optimizationGoal: s.campaign.objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" : "LEAD_GENERATION",
      targetingSummary: s.name.includes("Londrina") ? "25–65+ anos · Londrina" : "18–65+ anos · BR",
      startTime: null,
      endTime: null,
    }));
  },

  async ads() {
    await guard("ads");
    const cur = current(await loadState());
    return ads().map((a) => ({
      id: a.id,
      adSetId: a.set.id,
      campaignId: a.set.campaign.id,
      name: a.name,
      status: cur.ad(a).status,
      effectiveStatus: cur.ad(a).effective,
      creative: {
        id: `2383${a.id.slice(4)}`,
        name: a.name,
        title: a.ai ? "DEMO Consultas com desconto" : "DEMO Conheça o Cartão do Trabalhador",
        body: "DEMO Texto de anúncio de demonstração.",
        callToAction: "SIGN_UP",
        objectType: a.ai ? "SHARE" : "VIDEO",
        thumbnailUrl: null,
      },
    }));
  },

  async insights(_token, _account, level, since, until) {
    await guard("insights");
    const today = until;
    const rows = new Map<string, MetaInsightRow>();
    for (let day = since; day <= until; day = addDays(day, 1)) {
      for (const a of ads()) {
        const r = adDay(a.id, a.set.campaign, day, today);
        if (!r) continue;
        const objectId = level === "ad" ? a.id : level === "adset" ? a.set.id : a.set.campaign.id;
        const k = `${objectId}:${day}`;
        const cur = rows.get(k);
        if (!cur) rows.set(k, { ...r, objectId, actions: level === "ad" ? r.actions : [] });
        else for (const f of SUM) cur[f] += r[f];
      }
    }
    return [...rows.values()];
  },
};

/** Escrita SIMULADA (8.6): grava no Setting acima. Falha injetável com metodos: ["write"]. */
export const simulatedWriter: MetaAdsWriter = {
  async get(_token, level, id) {
    await guard("get");
    const cur = current(await loadState());
    const base = { accountId: SIMULATED_ACCOUNT_ID, lifetimeBudget: null };
    const c = level === "campaign" ? CAMPAIGNS.find((x) => x.id === id) : undefined;
    if (c) {
      const st = cur.camp(c);
      return {
        ...base,
        id,
        name: c.name,
        status: st.status,
        effectiveStatus: st.status,
        dailyBudget: st.daily,
      };
    }
    const s = level === "adset" ? adSets().find((x) => x.id === id) : undefined;
    if (s) {
      const st = cur.set(s);
      return {
        ...base,
        id,
        name: s.name,
        status: st.status,
        effectiveStatus: st.effective,
        dailyBudget: null,
      };
    }
    const a = level === "ad" ? ads().find((x) => x.id === id) : undefined;
    if (a) {
      const st = cur.ad(a);
      return {
        ...base,
        id,
        name: a.name,
        status: st.status,
        effectiveStatus: st.effective,
        dailyBudget: null,
      } satisfies MetaObjectState;
    }
    throw new MetaError("A Meta recusou a operação.", `simulado: item ${id} não existe`);
  },

  async setStatus(_token, id, status) {
    await guard("write");
    const all = [...CAMPAIGNS.map((c) => c.id), ...adSets().map((s) => s.id), ...ads().map((a) => a.id)];
    if (!all.includes(id))
      throw new MetaError("A Meta recusou a operação.", `simulado: item ${id} não existe`);
    if (CAMPAIGNS.find((c) => c.id === id)?.status === "ARCHIVED")
      throw new MetaError("A Meta recusou a operação.", "simulado: campanha arquivada");
    await saveState(id, { status });
  },

  async setDailyBudget(_token, id, cents) {
    await guard("write");
    if (!CAMPAIGNS.some((c) => c.id === id))
      throw new MetaError("A Meta recusou a operação.", `simulado: ${id} sem orçamento próprio`);
    await saveState(id, { daily: cents });
  },
};

/**
 * API de Conversões SIMULADA (8.7): guarda os últimos eventos recebidos no Setting
 * "simulado.meta.conversoes" (para os testes conferirem o formato). Falha injetável: metodos ["events"].
 */
export const SIMULATED_CONVERSIONS_KEY = "simulado.meta.conversoes";
export const simulatedConversions: MetaConversionsSender = {
  async send(_token, datasetId, events, testEventCode) {
    await guard("events");
    const cur = await prisma.setting.findUnique({ where: { key: SIMULATED_CONVERSIONS_KEY } });
    const prev = ((cur?.value as { eventos?: unknown[] } | null)?.eventos ?? []).slice(-150);
    const value = {
      eventos: [...prev, ...events.map((e) => ({ ...e, _dataset: datasetId, _teste: testEventCode }))],
    } as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({
      where: { key: SIMULATED_CONVERSIONS_KEY },
      create: {
        key: SIMULATED_CONVERSIONS_KEY,
        value,
        description: "DEMO: eventos recebidos pela Meta simulada",
      },
      update: { value },
    });
    return { received: events.length };
  },
};
