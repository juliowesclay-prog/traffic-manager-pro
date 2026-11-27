"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/auth";
import {
  disconnectMeta,
  META_STATE_COOKIE,
  refreshAdAccounts,
  selectAdAccount,
  startMetaConnect,
  type TrafficResult,
} from "@/server/traffic/connection";
import { can, parseBRL } from "@prosed/core";
import { runAnalysis } from "@/server/traffic/ai/analysis";
import { saveCapiSettings, sendConversionsNow } from "@/server/traffic/conversions";
import {
  cancelAction,
  decideAction,
  requestAction,
  saveActionSettings,
  type ActionResult,
} from "@/server/traffic/meta-actions";
import { manualSync, saveSyncInterval } from "@/server/traffic/sync";

const UUID = /^[0-9a-f-]{36}$/i;
export type ConnectStart = TrafficResult & { next?: string };

/** Começa a conexão: guarda o state num cookie httpOnly e devolve o endereço da Meta. */
export async function connectMetaAction(_: ConnectStart | undefined, _f: FormData): Promise<ConnectStart> {
  const { user } = await requireStaff("traffic:manage");
  const r = await startMetaConnect(user.id);
  if (!("url" in r)) return r;
  (await cookies()).set(META_STATE_COOKIE, r.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // a volta da Meta é uma navegação comum (GET), que leva cookies "lax"
    path: "/api/v1/admin/trafego/meta",
    maxAge: 10 * 60,
  });
  return { ok: true, message: "Abrindo a Meta…", next: r.url };
}

export async function selectAccountAction(_: TrafficResult | undefined, f: FormData): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Conta inválida." };
  const r = await selectAdAccount(user.id, id);
  if (r.ok) revalidatePath("/admin/trafego");
  return r;
}

export async function refreshAccountsAction(
  _: TrafficResult | undefined,
  _f: FormData,
): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  const r = await refreshAdAccounts(user.id);
  revalidatePath("/admin/trafego");
  return r;
}

export async function disconnectMetaAction(
  _: TrafficResult | undefined,
  f: FormData,
): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  if (f.get("confirmo") !== "on") return { ok: false, message: "Marque a confirmação para desconectar." };
  const r = await disconnectMeta(user.id);
  revalidatePath("/admin/trafego");
  return r;
}

export async function syncNowAction(_: TrafficResult | undefined, _f: FormData): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  const r = await manualSync(user.id);
  revalidatePath("/admin/trafego/campanhas");
  return r;
}

export async function syncIntervalAction(_: TrafficResult | undefined, f: FormData): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  const r = await saveSyncInterval(user.id, Number(f.get("intervalo")));
  if (r.ok) revalidatePath("/admin/trafego/campanhas");
  return r;
}

/** Pede uma análise à IA (somente leitura: nada é alterado na Meta). */
export async function analyzeAction(_: ConnectStart | undefined, f: FormData): Promise<ConnectStart> {
  const { user } = await requireStaff("traffic:manage");
  const r = await runAnalysis(user.id, Number(f.get("periodo")));
  revalidatePath("/admin/trafego/ia");
  return r.ok
    ? { ok: true, message: "Análise pronta.", next: `/admin/trafego/ia?analise=${r.id}` }
    : { ok: false, message: r.message };
}

// ─── Ações nos anúncios (8.6) ─────────────────

const ACOES = "/admin/trafego/acoes";
/** Com registro gravado, mostra o resultado no topo da tela (lido do banco); senão, devolve a mensagem. */
function done(r: ActionResult): ActionResult {
  revalidatePath(ACOES);
  if (r.id) redirect(`${ACOES}?acao=${r.id}#resultado`);
  return r;
}

/** Pede (ou executa, se diminui o gasto) uma ação na Meta. */
export async function requestTrafficAction(_: ActionResult | undefined, f: FormData): Promise<ActionResult> {
  const { user } = await requireStaff("traffic:manage");
  if (f.get("confirmo") !== "on") return { ok: false, message: "Marque a confirmação para continuar." };
  const valor = String(f.get("valor") ?? "").trim();
  const analise = String(f.get("analise") ?? "");
  const r = await requestAction(user.id, {
    objectId: String(f.get("alvo") ?? ""),
    kind: String(f.get("tipo") ?? ""),
    newBudget: valor ? parseBRL(valor) : null,
    reason: String(f.get("motivo") ?? ""),
    analysisId: UUID.test(analise) ? analise : null,
  });
  return done(r);
}

/** Aprova (e executa) ou recusa um pedido que aumenta o gasto. Só quem tem traffic:approve. */
export async function decideTrafficAction(_: ActionResult | undefined, f: FormData): Promise<ActionResult> {
  const { user } = await requireStaff("traffic:approve");
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Pedido inválido." };
  const approve = f.get("decisao") === "aprovar";
  if (approve && f.get("confirmo") !== "on")
    return { ok: false, message: "Marque a confirmação para aprovar." };
  return done(await decideAction(user.id, id, approve, String(f.get("observacao") ?? "")));
}

export async function cancelTrafficAction(_: ActionResult | undefined, f: FormData): Promise<ActionResult> {
  const { user, roles } = await requireStaff("traffic:manage");
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Pedido inválido." };
  return done(await cancelAction(user.id, id, can(roles, "traffic:approve")));
}

export async function saveActionSettingsAction(
  _: TrafficResult | undefined,
  f: FormData,
): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:approve");
  const teto = String(f.get("teto") ?? "").trim();
  const cap = teto ? parseBRL(teto) : null;
  if (teto && cap == null) return { ok: false, message: "Teto inválido. Exemplo: 150,00" };
  const r = await saveActionSettings(user.id, {
    enabled: f.get("ligadas") === "on",
    dailyCapCents: cap,
    maxIncreasePct: Number(f.get("aumento")),
  });
  revalidatePath(ACOES);
  return r;
}

// ─── API de Conversões (8.7) ─────────────────

export async function saveCapiSettingsAction(
  _: TrafficResult | undefined,
  f: FormData,
): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:approve");
  const r = await saveCapiSettings(user.id, {
    enabled: f.get("ligada") === "on",
    datasetId: String(f.get("dataset") ?? ""),
    testEventCode: String(f.get("teste") ?? ""),
  });
  revalidatePath("/admin/trafego/conversoes");
  return r;
}

export async function sendConversionsAction(
  _: TrafficResult | undefined,
  _f: FormData,
): Promise<TrafficResult> {
  const { user } = await requireStaff("traffic:manage");
  const r = await sendConversionsNow(user.id);
  revalidatePath("/admin/trafego/conversoes");
  return r;
}
