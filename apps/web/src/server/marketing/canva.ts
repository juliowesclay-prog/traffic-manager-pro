import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { decrypt, encrypt } from "@tmp/db";
import { audit } from "../audit";
import { prisma } from "../db";
import { rateLimit } from "../rate-limit";
import { createCreative, type CreativeResult } from "./creatives";
import { storeGenerated } from "./media";

/**
 * Canva (Etapa 5): a pessoa conecta a PRÓPRIA conta do Canva (OAuth com PKCE), vê os designs dela e
 * importa um design exportado (PNG, várias páginas = carrossel, ou MP4) para a biblioteca, com origem
 * "Canva". As chaves ficam cifradas no banco; nada é alterado no Canva.
 * Sem CANVA_CLIENT_ID/SECRET a seção mostra "não configurado". CANVA_PROVIDER=simulado (só testes)
 * usa designs DEMO gerados aqui.
 */

export const CANVA_STATE_COOKIE = "tmp_canva_state";
const API = "https://api.canva.com/rest/v1";
const AUTHORIZE = "https://www.canva.com/api/oauth/authorize";
const SCOPES = ["design:meta:read", "design:content:read"];
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export type CanvaResult = { ok: true; message: string } | { ok: false; message: string };
export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  pageCount: number | null;
  updatedAt: Date | null;
  editUrl: string | null;
}
export type CanvaFormat = "png" | "mp4_vertical" | "mp4_horizontal";
export const CANVA_FORMATS: Record<CanvaFormat, string> = {
  png: "Imagem PNG (várias páginas viram carrossel)",
  mp4_vertical: "Vídeo MP4 vertical (1080p)",
  mp4_horizontal: "Vídeo MP4 horizontal (1080p)",
};

export class CanvaError extends Error {}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function canvaMode(): "real" | "simulado" | null {
  if (process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET) return "real";
  if (process.env.CANVA_PROVIDER === "simulado") return "simulado";
  return null;
}
export const canvaRedirectUri = () =>
  `${(process.env.APP_URL ?? "http://127.0.0.1:3300").replace(/\/$/, "")}/api/v1/admin/marketing/canva/retorno`;

// ─── Conexão ─────────────────────────────────────────────────────────────────────────────

export async function startCanvaConnect(
  userId: string,
): Promise<{ ok: true; url: string; state: string } | { ok: false; message: string }> {
  const mode = canvaMode();
  if (!mode) return { ok: false, message: "A integração com o Canva ainda não foi configurada." };
  if (!(await rateLimit(`canva-connect:${userId}`, 10, 3600)))
    return { ok: false, message: "Muitas tentativas de conexão. Espere alguns minutos." };
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  await prisma.canvaOAuthState.create({
    data: {
      stateHash: sha(state),
      verifierEnc: encrypt(verifier),
      userId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  if (mode === "simulado") {
    const u = new URL(canvaRedirectUri());
    u.searchParams.set("code", "demo");
    u.searchParams.set("state", state);
    return { ok: true, url: u.toString(), state };
  }
  const u = new URL(AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.CANVA_CLIENT_ID!);
  u.searchParams.set("redirect_uri", canvaRedirectUri());
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  u.searchParams.set("code_challenge_method", "s256");
  return { ok: true, url: u.toString(), state };
}

type TokenSet = { access: string; refresh: string; expiresAt: Date; scopes: string[] };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const basic = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!res.ok || !j.access_token || !j.refresh_token)
    throw new CanvaError("O Canva recusou a autorização. Conecte de novo.");
  return {
    access: j.access_token,
    refresh: j.refresh_token,
    expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
    scopes: (j.scope ?? "").split(/\s+/).filter(Boolean),
  };
}

export async function finishCanvaConnect(
  userId: string,
  q: { code: string | null; state: string | null; error: string | null },
  cookieState: string | null,
): Promise<"conectado" | "cancelado" | "invalido" | "expirou" | "recusado"> {
  if (!q.state || !cookieState || !same(q.state, cookieState)) return "invalido";
  const row = await prisma.canvaOAuthState.findFirst({
    where: { stateHash: sha(q.state), userId, usedAt: null, expiresAt: { gt: new Date() } },
  });
  const claimed = row
    ? await prisma.canvaOAuthState.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      })
    : { count: 0 };
  if (!row || claimed.count !== 1) return "expirou";
  if (q.error || !q.code) return q.error === "access_denied" ? "cancelado" : "recusado";
  let t: TokenSet;
  try {
    t =
      canvaMode() === "simulado"
        ? { access: "demo", refresh: "demo", expiresAt: new Date(Date.now() + 4 * 3600_000), scopes: SCOPES }
        : await tokenRequest({
            grant_type: "authorization_code",
            code: q.code,
            code_verifier: decrypt(row.verifierEnc),
            redirect_uri: canvaRedirectUri(),
          });
  } catch {
    return "recusado";
  }
  const data = {
    accessEnc: encrypt(t.access),
    refreshEnc: encrypt(t.refresh),
    expiresAt: t.expiresAt,
    scopes: t.scopes,
  };
  const existing = await prisma.canvaConnection.findFirst({ where: { userId } });
  if (existing) await prisma.canvaConnection.update({ where: { id: existing.id }, data });
  else await prisma.canvaConnection.create({ data: { userId, ...data } });
  await audit({
    actorId: userId,
    action: "marketing.canva_connected",
    entity: "CanvaConnection",
    entityId: userId,
  });
  return "conectado";
}

export async function canvaStatus(userId: string) {
  const c = await prisma.canvaConnection.findFirst({ where: { userId }, select: { updatedAt: true } });
  return { mode: canvaMode(), connected: !!c, since: c?.updatedAt ?? null };
}

export async function disconnectCanva(userId: string): Promise<CanvaResult> {
  const c = await prisma.canvaConnection.findFirst({ where: { userId } });
  if (!c) return { ok: false, message: "O Canva não está conectado." };
  if (canvaMode() === "real")
    await fetch(`${API}/oauth/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: decrypt(c.refreshEnc) }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
  await prisma.canvaConnection.deleteMany({ where: { userId } });
  await audit({
    actorId: userId,
    action: "marketing.canva_disconnected",
    entity: "CanvaConnection",
    entityId: userId,
  });
  return { ok: true, message: "Canva desconectado." };
}

/** Chave de acesso válida (renova quando falta menos de 1 minuto; o Canva troca a chave de renovação). */
async function accessToken(userId: string): Promise<string> {
  const c = await prisma.canvaConnection.findFirst({ where: { userId } });
  if (!c) throw new CanvaError("Conecte o Canva primeiro.");
  if (canvaMode() === "simulado") return "demo";
  if (c.expiresAt.getTime() > Date.now() + 60_000) return decrypt(c.accessEnc);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshEnc) }).catch(
    async (e) => {
      await prisma.canvaConnection.deleteMany({ where: { id: c.id } });
      throw e;
    },
  );
  await prisma.canvaConnection.update({
    where: { id: c.id },
    data: {
      accessEnc: encrypt(t.access),
      refreshEnc: encrypt(t.refresh),
      expiresAt: t.expiresAt,
      scopes: t.scopes,
    },
  });
  return t.access;
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 401) throw new CanvaError("A conexão com o Canva venceu. Conecte de novo.");
  if (res.status === 429) throw new CanvaError("O Canva pediu para esperar um pouco. Tente em instantes.");
  if (!res.ok)
    throw new CanvaError(
      `O Canva recusou o pedido${j.message ? `: ${String(j.message).slice(0, 160)}` : "."}`,
    );
  return j;
}

// ─── Designs ─────────────────────────────────────────────────────────────────────────────

const DEMO_DESIGNS: CanvaDesign[] = [
  {
    id: "DEMO-canva-1",
    title: "DEMO Post Cartão do Trabalhador",
    thumbnailUrl: null,
    pageCount: 1,
    updatedAt: null,
    editUrl: null,
  },
  {
    id: "DEMO-canva-2",
    title: "DEMO Carrossel 3 páginas",
    thumbnailUrl: null,
    pageCount: 3,
    updatedAt: null,
    editUrl: null,
  },
];

export async function listDesigns(
  userId: string,
  continuation?: string,
): Promise<{ ok: true; designs: CanvaDesign[]; next: string | null } | { ok: false; message: string }> {
  try {
    const token = await accessToken(userId);
    if (canvaMode() === "simulado") return { ok: true, designs: DEMO_DESIGNS, next: null };
    const q = new URLSearchParams({ ownership: "any", sort_by: "modified_descending" });
    if (continuation) q.set("continuation", continuation);
    const j = await api<{
      items?: {
        id: string;
        title?: string;
        thumbnail?: { url?: string };
        page_count?: number;
        updated_at?: number;
        urls?: { edit_url?: string };
      }[];
      continuation?: string;
    }>(token, `/designs?${q}`);
    return {
      ok: true,
      designs: (j.items ?? []).map((d) => ({
        id: d.id,
        title: d.title || "Sem título",
        thumbnailUrl: d.thumbnail?.url ?? null,
        pageCount: d.page_count ?? null,
        updatedAt: d.updated_at ? new Date(d.updated_at * 1000) : null,
        editUrl: d.urls?.edit_url ?? null,
      })),
      next: j.continuation ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof CanvaError ? e.message : "Não foi possível falar com o Canva agora.",
    };
  }
}

async function demoExport(designId: string, format: CanvaFormat): Promise<Uint8Array[]> {
  if (format !== "png") throw new CanvaError("O Canva simulado só exporta PNG.");
  const pages = DEMO_DESIGNS.find((d) => d.id === designId)?.pageCount ?? 1;
  return Promise.all(
    Array.from({ length: pages }, async (_, i) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#1E3A8A"/><text x="540" y="560" font-size="72" fill="#fff" text-anchor="middle" font-family="sans-serif">DEMO Canva ${i + 1}/${pages}</text></svg>`;
      return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
    }),
  );
}

async function download(url: string): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new CanvaError("Arquivo do Canva com endereço inválido.");
  const res = await fetch(u, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new CanvaError("Não foi possível baixar o arquivo exportado do Canva.");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_IMPORT_BYTES) throw new CanvaError("O arquivo exportado passa de 200 MB.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMPORT_BYTES) throw new CanvaError("O arquivo exportado passa de 200 MB.");
  return buf;
}

async function realExport(token: string, designId: string, format: CanvaFormat): Promise<Uint8Array[]> {
  const fmt =
    format === "png"
      ? { type: "png" }
      : { type: "mp4", quality: format === "mp4_vertical" ? "vertical_1080p" : "horizontal_1080p" };
  const start = await api<{ job?: { id: string } }>(token, "/exports", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, format: fmt }),
  });
  const jobId = start.job?.id;
  if (!jobId) throw new CanvaError("O Canva não começou a exportação.");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 3000));
    const j = await api<{ job?: { status?: string; urls?: string[]; error?: { message?: string } } }>(
      token,
      `/exports/${encodeURIComponent(jobId)}`,
    );
    if (j.job?.status === "success") {
      const urls = (j.job.urls ?? []).slice(0, 10);
      if (!urls.length) throw new CanvaError("O Canva não devolveu arquivos.");
      return Promise.all(urls.map(download));
    }
    if (j.job?.status === "failed")
      throw new CanvaError(
        `O Canva não conseguiu exportar${j.job.error?.message ? `: ${j.job.error.message.slice(0, 160)}` : "."}`,
      );
  }
  throw new CanvaError("A exportação do Canva demorou demais. Tente de novo.");
}

/** Exporta o design do Canva e cria um criativo novo na biblioteca (origem Canva, aguardando revisão). */
export async function importDesign(
  userId: string,
  designId: string,
  title: string,
  format: CanvaFormat,
): Promise<CreativeResult> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(designId)) return { ok: false, message: "Design inválido." };
  if (!(format in CANVA_FORMATS)) return { ok: false, message: "Formato inválido." };
  if (!(await rateLimit(`canva-import:${userId}`, 30, 3600)))
    return { ok: false, message: "Muitas importações na última hora. Aguarde." };
  try {
    const token = await accessToken(userId);
    const files =
      canvaMode() === "simulado"
        ? await demoExport(designId, format)
        : await realExport(token, designId, format);
    const ids: string[] = [];
    const ext = format === "png" ? "png" : "mp4";
    for (const [i, bytes] of files.entries()) {
      const r = await storeGenerated(userId, bytes, `${title}-${i + 1}.${ext}`);
      if (!r.ok) return r;
      ids.push(r.asset.id);
    }
    const name = (title.trim() || "Design do Canva").slice(0, 120);
    const r = await createCreative(userId, {
      name: name.length >= 2 ? name : "Design do Canva",
      brandId: null,
      campaignId: null,
      assetIds: ids,
      origin: "CANVA",
      spec: { tipo: "canva", designId, format },
      note: `Importado do Canva (${CANVA_FORMATS[format]})`,
    });
    if (r.ok)
      await audit({
        actorId: userId,
        action: "marketing.canva_imported",
        entity: "Creative",
        entityId: r.id ?? null,
        after: { design: designId, formato: format, arquivos: ids.length },
      });
    return r;
  } catch (e) {
    return {
      ok: false,
      message: e instanceof CanvaError ? e.message : "Não foi possível importar do Canva agora.",
    };
  }
}
