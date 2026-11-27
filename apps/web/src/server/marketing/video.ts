import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  BRAND_FONTS,
  CREATIVE_KIND_LABELS,
  parseVideoSpec,
  VIDEO_FORMATS,
  type CaptionSegment,
  type VideoEditSpec,
} from "@tmp/core";
import { prisma as base, type Prisma } from "@tmp/db";
import { audit } from "../audit";
import { prisma } from "../db";
import { rateLimit } from "../rate-limit";
import { runWithCompany } from "../tenant";
import { createCreative, type CreativeResult } from "./creatives";
import { finalizeUpload, removeStored } from "./media";
import { storage, storageKeyFor } from "./storage";
import { transcribe, TranscribeError, transcribeProviderName } from "./transcribe";

/**
 * Editor de vídeos (Etapa 4). O site só organiza: confere o pedido, põe na fila (tabela video_jobs) e
 * recebe o resultado. Quem corta, legenda e renderiza é o servidor de vídeo (apps/video-worker, com
 * FFmpeg), fora da Vercel. Ele não tem acesso ao banco: fala com o site por rotas internas protegidas
 * por VIDEO_WORKER_SECRET e baixa/envia os arquivos por links temporários.
 */

const LEASE_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const HEARTBEAT_KEY = "video.servidor.visto";

export type VideoResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

async function sourceOf(creativeId: string) {
  const c = await prisma.creative.findFirst({
    where: { id: creativeId },
    include: {
      brand: {
        select: { id: true, name: true, logoAssetId: true, colors: true, bodyFont: true, ctas: true },
      },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { assets: { where: { status: "PRONTO" }, take: 1 } },
      },
    },
  });
  const asset = c?.versions[0]?.assets[0];
  if (!c || c.kind !== "VIDEO" || !asset || !asset.durationMs) return null;
  return { creative: c, asset };
}

export async function requestTranscription(userId: string, creativeId: string): Promise<VideoResult> {
  if (!transcribeProviderName())
    return { ok: false, message: "A transcrição automática ainda não foi configurada." };
  const src = await sourceOf(creativeId);
  if (!src) return { ok: false, message: "Vídeo não encontrado." };
  if (!(await rateLimit(`mkt-video:${userId}`, 30, 60 * 60)))
    return { ok: false, message: "Muitos pedidos de vídeo na última hora." };
  const pending = await prisma.videoJob.findFirst({
    where: { creativeId, kind: "TRANSCREVER", status: { in: ["NA_FILA", "PROCESSANDO"] } },
  });
  if (pending) return { ok: false, message: "A transcrição deste vídeo já está na fila." };
  const job = await prisma.videoJob.create({
    data: {
      kind: "TRANSCREVER",
      creativeId,
      sourceAssetId: src.asset.id,
      spec: {},
      createdById: userId,
    } as Prisma.VideoJobUncheckedCreateInput,
  });
  await audit({
    actorId: userId,
    action: "marketing.video_transcribe_requested",
    entity: "VideoJob",
    entityId: job.id,
  });
  return {
    ok: true,
    message: "Transcrição na fila. As legendas aparecem aqui quando ficarem prontas.",
    id: job.id,
  };
}

export async function requestEdit(
  userId: string,
  creativeId: string,
  raw: Record<string, unknown>,
): Promise<VideoResult> {
  const src = await sourceOf(creativeId);
  if (!src) return { ok: false, message: "Vídeo não encontrado." };
  const p = parseVideoSpec(raw, src.asset.durationMs!, BRAND_FONTS);
  if (!p.ok) return p;
  if (p.spec.logo.enabled && !src.creative.brand?.logoAssetId)
    return {
      ok: false,
      message: "Para pôr a logomarca, ligue o vídeo a uma marca com logomarca no kit da marca.",
    };
  if (!(await rateLimit(`mkt-video:${userId}`, 30, 60 * 60)))
    return { ok: false, message: "Muitos pedidos de vídeo na última hora." };
  const spec: VideoEditSpec = { ...p.spec, brandId: src.creative.brandId };
  const job = await prisma.videoJob.create({
    data: {
      kind: "EDITAR",
      creativeId,
      sourceAssetId: src.asset.id,
      spec: spec as unknown as Prisma.InputJsonValue,
      createdById: userId,
    } as Prisma.VideoJobUncheckedCreateInput,
  });
  await audit({
    actorId: userId,
    action: "marketing.video_edit_requested",
    entity: "VideoJob",
    entityId: job.id,
    after: { formatos: spec.formats, legendas: spec.captions.enabled, silencio: spec.removeSilence },
  });
  return {
    ok: true,
    message: `Edição na fila (${spec.formats.length} formato${spec.formats.length > 1 ? "s" : ""}).`,
    id: job.id,
  };
}

export async function cancelJob(userId: string, id: string): Promise<VideoResult> {
  const r = await prisma.videoJob.updateMany({
    where: { id, status: "NA_FILA" },
    data: { status: "CANCELADO", finishedAt: new Date() },
  });
  if (r.count !== 1) return { ok: false, message: "Só dá para cancelar o que ainda não começou." };
  await audit({ actorId: userId, action: "marketing.video_cancelled", entity: "VideoJob", entityId: id });
  return { ok: true, message: "Pedido cancelado." };
}

export async function jobsFor(creativeId: string) {
  return prisma.videoJob.findMany({ where: { creativeId }, orderBy: { createdAt: "desc" }, take: 20 });
}

/** Última transcrição pronta do vídeo (para preencher as legendas). */
export async function latestTranscript(creativeId: string): Promise<CaptionSegment[] | null> {
  const j = await prisma.videoJob.findFirst({
    where: { creativeId, kind: "TRANSCREVER", status: "CONCLUIDO" },
    orderBy: { finishedAt: "desc" },
  });
  const segs = (j?.result as { segmentos?: CaptionSegment[] } | null)?.segmentos;
  return segs ?? null;
}

/** Quando o servidor de vídeo falou com o site pela última vez (para avisar na tela se está desligado). */
export async function workerLastSeen(): Promise<Date | null> {
  const s = await base.setting.findUnique({ where: { key: HEARTBEAT_KEY } });
  const at = (s?.value as { at?: string } | null)?.at;
  return at ? new Date(at) : null;
}

// ─── Lado do servidor de vídeo (rotas internas) ─────────────────

export function workerAuthorized(request: Request): string | null {
  const secret = process.env.VIDEO_WORKER_SECRET ?? "";
  const given = request.headers.get("x-video-secret") ?? "";
  const worker = (request.headers.get("x-video-worker") ?? "").replace(/[^\w.-]/g, "").slice(0, 60);
  if (
    secret.length < 32 ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
    return null;
  return worker || "servidor";
}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3300").replace(/\/+$/, "");

async function linkFor(
  key: string,
  assetId: string,
  jobId: string,
  what: "origem" | "logo",
): Promise<string> {
  const s = storage();
  if (s.presignGet)
    return s.presignGet(key, {
      expiresSeconds: 60 * 60,
      filename: `${what}.bin`,
      contentType: "application/octet-stream",
      download: true,
    });
  return `${appUrl()}/api/internal/video/tarefas/${jobId}/${what}?arquivo=${assetId}`;
}

export interface ClaimedJob {
  id: string;
  kind: "TRANSCREVER" | "EDITAR";
  durationMs: number;
  source: string;
  logo: string | null;
  spec: VideoEditSpec | null;
  outputs: { format: string; assetId: string; url: string }[];
}

/** Pega a próxima tarefa da fila (ou uma cujo servidor caiu), reservando-a por 3 minutos. */
export async function claimJob(worker: string): Promise<ClaimedJob | null> {
  await base.setting.upsert({
    where: { key: HEARTBEAT_KEY },
    create: {
      key: HEARTBEAT_KEY,
      value: { at: new Date().toISOString(), worker },
      description: "Último contato do servidor de vídeo",
    },
    update: { value: { at: new Date().toISOString(), worker } },
  });
  // Tarefas que estouraram as tentativas viram falha (o servidor caiu várias vezes nelas).
  await base.$executeRaw`UPDATE video_jobs SET status = 'FALHOU', error = 'O servidor de vídeo parou no meio várias vezes.', "finishedAt" = now(), "lockedBy" = NULL, "leaseUntil" = NULL
    WHERE status = 'PROCESSANDO' AND "leaseUntil" < now() AND attempts >= ${MAX_ATTEMPTS}`;
  const rows = await base.$queryRaw<{ id: string; companyId: string }[]>`
    UPDATE video_jobs SET status = 'PROCESSANDO', "lockedBy" = ${worker}, "leaseUntil" = now() + make_interval(secs => ${LEASE_MS / 1000}),
      attempts = attempts + 1, "startedAt" = COALESCE("startedAt", now()), progress = 0, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM video_jobs
      WHERE (status = 'NA_FILA' OR (status = 'PROCESSANDO' AND "leaseUntil" < now())) AND attempts < ${MAX_ATTEMPTS}
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, "companyId"`;
  const row = rows[0];
  if (!row) return null;
  return runWithCompany(row.companyId, async () => {
    const job = await prisma.videoJob.findFirstOrThrow({ where: { id: row.id } });
    const asset = await prisma.mediaAsset.findFirst({ where: { id: job.sourceAssetId, status: "PRONTO" } });
    if (!asset?.durationMs) {
      await finishFailed(job.id, "O vídeo de origem não existe mais.");
      return null;
    }
    // Uma nova tentativa descarta os arquivos de saída da tentativa anterior.
    await dropPendingOutputs(job.result);
    const spec = job.kind === "EDITAR" ? (job.spec as unknown as VideoEditSpec) : null;
    let logo: string | null = null;
    if (spec?.logo.enabled && spec.brandId) {
      const b = await prisma.brand.findFirst({ where: { id: spec.brandId }, include: { logo: true } });
      if (b?.logo?.status === "PRONTO") logo = await linkFor(b.logo.storageKey, b.logo.id, job.id, "logo");
    }
    const outputs: ClaimedJob["outputs"] = [];
    if (spec) {
      const s = storage();
      for (const format of spec.formats) {
        const id = randomUUID();
        const key = storageKeyFor(job.companyId, id);
        await prisma.mediaAsset.create({
          data: {
            id,
            companyId: job.companyId,
            storageKey: key,
            originalName: `${spec.name}-${format.replace(":", "x")}.mp4`,
            declaredType: "video/mp4",
            declaredSize: BigInt(500 * 1024 * 1024),
            kind: "VIDEO",
            purpose: "criativo",
            uploadedById: job.createdById,
          },
        });
        const url = s.presignPut
          ? await s.presignPut(key, 2 * 60 * 60)
          : `${appUrl()}/api/internal/video/tarefas/${job.id}/saida/${id}`;
        outputs.push({ format, assetId: id, url });
      }
      await prisma.videoJob.update({
        where: { id: job.id },
        data: { result: { pendentes: outputs.map((o) => o.assetId) } },
      });
    }
    return {
      id: job.id,
      kind: job.kind,
      durationMs: asset.durationMs,
      source: await linkFor(asset.storageKey, asset.id, job.id, "origem"),
      logo,
      spec,
      outputs,
    };
  });
}

async function dropPendingOutputs(result: Prisma.JsonValue | null) {
  const ids = (result as { pendentes?: string[] } | null)?.pendentes ?? [];
  if (!ids.length) return;
  const rows = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, versionId: null },
    select: { id: true, storageKey: true },
  });
  await removeStored(rows.map((r) => r.storageKey));
  await prisma.mediaAsset.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

async function finishFailed(id: string, error: string) {
  const job = await prisma.videoJob.findFirst({ where: { id } });
  if (job) await dropPendingOutputs(job.result);
  await prisma.videoJob.updateMany({
    where: { id },
    data: {
      status: "FALHOU",
      error: error.slice(0, 500),
      finishedAt: new Date(),
      lockedBy: null,
      leaseUntil: null,
    },
  });
}

/** Tarefa reservada por este servidor (confere dono e situação). Executa no contexto da empresa dela. */
export async function withWorkerJob<T>(
  id: string,
  worker: string,
  fn: (job: Awaited<ReturnType<typeof base.videoJob.findFirstOrThrow>>) => Promise<T>,
): Promise<T | null> {
  const job = await base.videoJob.findFirst({ where: { id, lockedBy: worker, status: "PROCESSANDO" } });
  if (!job) return null;
  return runWithCompany(job.companyId, () => fn(job));
}

export async function reportProgress(id: string, worker: string, progress: number) {
  const r = await base.videoJob.updateMany({
    where: { id, lockedBy: worker, status: "PROCESSANDO" },
    data: {
      progress: Math.max(0, Math.min(99, Math.round(progress))),
      leaseUntil: new Date(Date.now() + LEASE_MS),
    },
  });
  return r.count === 1;
}

export async function reportFailure(id: string, worker: string, error: string) {
  return withWorkerJob(id, worker, async () => {
    await finishFailed(id, `Falha no servidor de vídeo: ${error}`);
    return true;
  });
}

/** Transcrição: recebe o áudio (MP3 mono), transcreve e guarda os trechos. */
export async function receiveAudio(id: string, worker: string, audio: Uint8Array) {
  return withWorkerJob(id, worker, async (job) => {
    const asset = await prisma.mediaAsset.findFirst({ where: { id: job.sourceAssetId } });
    try {
      const { segments, model } = await transcribe(audio, asset?.durationMs ?? 0);
      await prisma.videoJob.updateMany({
        where: { id },
        data: {
          status: "CONCLUIDO",
          progress: 100,
          result: { segmentos: segments, modelo: model } as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
          lockedBy: null,
          leaseUntil: null,
        },
      });
      await audit({
        actorId: job.createdById,
        action: "marketing.video_transcribed",
        entity: "VideoJob",
        entityId: id,
        after: { trechos: segments.length, modelo: model },
      });
      return { ok: true as const, trechos: segments.length };
    } catch (e) {
      const msg = e instanceof TranscribeError ? e.message : "Erro inesperado na transcrição.";
      console.error("transcricao", e instanceof TranscribeError ? e.detail : e);
      await finishFailed(id, msg);
      return { ok: false as const, message: msg };
    }
  });
}

/** Edição: confere cada vídeo gerado e cria um criativo por formato (rascunho, origem IA). */
export async function completeEdit(id: string, worker: string) {
  return withWorkerJob(id, worker, async (job) => {
    const spec = job.spec as unknown as VideoEditSpec;
    const pending = (job.result as { pendentes?: string[] } | null)?.pendentes ?? [];
    const outputs = await prisma.mediaAsset.findMany({ where: { id: { in: pending } } });
    const created: string[] = [];
    const errors: string[] = [];
    for (const assetId of pending) {
      const asset = outputs.find((o) => o.id === assetId);
      const format = asset?.originalName.match(/-(\d+x\d+)\.mp4$/)?.[1]?.replace("x", ":") ?? "";
      const fin = await finalizeUpload(job.createdById, assetId);
      if (!fin.ok) {
        errors.push(`${format}: ${fin.message}`);
        continue;
      }
      const label = VIDEO_FORMATS[format as keyof typeof VIDEO_FORMATS]?.label ?? format;
      const r: CreativeResult = await createCreative(job.createdById, {
        name: `${spec.name} (${format})`.slice(0, 120),
        brandId: spec.brandId,
        campaignId: null,
        assetIds: [assetId],
        origin: "IA",
        spec: {
          tipo: "video",
          formato: format,
          origem: job.creativeId,
          ...spec,
        } as unknown as Prisma.InputJsonValue,
        note: `Vídeo editado (${label})`,
      });
      if (r.ok && r.id) created.push(r.id);
      else errors.push(`${format}: ${r.message}`);
    }
    const ok = created.length > 0;
    await prisma.videoJob.updateMany({
      where: { id },
      data: {
        status: ok ? "CONCLUIDO" : "FALHOU",
        progress: ok ? 100 : job.progress,
        error: errors.length ? errors.join(" | ").slice(0, 500) : null,
        result: { criativos: created } as Prisma.InputJsonValue,
        finishedAt: new Date(),
        lockedBy: null,
        leaseUntil: null,
      },
    });
    await audit({
      actorId: job.createdById,
      action: "marketing.video_edited",
      entity: "VideoJob",
      entityId: id,
      after: { criativos: created.length, erros: errors.length, tipo: CREATIVE_KIND_LABELS.VIDEO },
    });
    return { ok, criativos: created, erros: errors };
  });
}

/** Arquivo pedido pelo servidor de vídeo no modo local (origem ou logomarca da tarefa). */
export async function workerFile(id: string, worker: string, what: "origem" | "logo", assetId: string) {
  return withWorkerJob(id, worker, async (job) => {
    if (what === "origem" && assetId !== job.sourceAssetId) return null;
    if (what === "logo") {
      const spec = job.spec as unknown as VideoEditSpec;
      const b = spec?.brandId
        ? await prisma.brand.findFirst({ where: { id: spec.brandId }, select: { logoAssetId: true } })
        : null;
      if (!b || b.logoAssetId !== assetId) return null;
    }
    const a = await prisma.mediaAsset.findFirst({ where: { id: assetId, status: "PRONTO" } });
    if (!a || a.sizeBytes == null) return null;
    return {
      stream: storage().stream(a.storageKey),
      size: Number(a.sizeBytes),
      mime: a.mimeType ?? "application/octet-stream",
    };
  });
}

/** Saída enviada pelo servidor de vídeo no modo local (no R2 ele envia direto por link assinado). */
export async function workerUpload(
  id: string,
  worker: string,
  assetId: string,
  body: ReadableStream<Uint8Array>,
) {
  return withWorkerJob(id, worker, async (job) => {
    const pending = (job.result as { pendentes?: string[] } | null)?.pendentes ?? [];
    if (!pending.includes(assetId)) return false;
    const a = await prisma.mediaAsset.findFirst({ where: { id: assetId, status: "AGUARDANDO_ENVIO" } });
    if (!a) return false;
    await storage().write(a.storageKey, body, 500 * 1024 * 1024);
    return true;
  });
}
