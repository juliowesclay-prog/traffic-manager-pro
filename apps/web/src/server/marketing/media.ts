import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  bufferReader,
  checkDeclaredUpload,
  checkProbedMedia,
  MEDIA_LIMITS,
  probeMedia,
  safeFileName,
  type UploadPurpose,
} from "@tmp/core";
import { audit } from "../audit";
import { prisma } from "../db";
import { rateLimit } from "../rate-limit";
import { currentCompanyId } from "../tenant";
import { storage, storageKeyFor, StorageNotConfiguredError, TooLargeError } from "./storage";

/**
 * Envio de arquivos em 3 passos (o mesmo desenho que o Cloudflare R2 vai usar):
 * 1) createUpload: confere o que o navegador declarou e reserva o registro;
 * 2) receiveUpload: recebe os bytes (no R2, o navegador envia direto ao armazenamento);
 * 3) finalizeUpload: confere o CONTEÚDO (tipo real, medidas, duração, hash) e libera o arquivo.
 * Arquivo recusado é apagado na hora.
 */

export type MediaResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

const serialize = (a: {
  id: string;
  kind: "IMAGEM" | "VIDEO";
  mimeType: string | null;
  sizeBytes: bigint | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalName: string;
}) => ({
  id: a.id,
  kind: a.kind,
  mimeType: a.mimeType,
  sizeBytes: a.sizeBytes == null ? null : Number(a.sizeBytes),
  width: a.width,
  height: a.height,
  durationMs: a.durationMs,
  originalName: a.originalName,
});
export type MediaInfo = ReturnType<typeof serialize>;

async function usedBytes(): Promise<number> {
  const r = await prisma.mediaAsset.aggregate({ _sum: { sizeBytes: true }, where: { status: "PRONTO" } });
  return Number(r._sum.sizeBytes ?? 0n);
}

export async function createUpload(
  userId: string,
  input: { name: string; type: string; size: number; purpose: UploadPurpose },
): Promise<MediaResult<{ id: string; uploadUrl: string; method: "PUT" }>> {
  const s = (() => {
    try {
      return storage();
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) return e;
      throw e;
    }
  })();
  if (s instanceof Error) return { ok: false, message: s.message };
  if (!(await rateLimit(`mkt-upload:${userId}`, 60, 10 * 60)))
    return { ok: false, message: "Muitos envios seguidos. Aguarde alguns minutos." };
  const check = checkDeclaredUpload(input.purpose, input.type, input.size);
  if (!check.ok) return check;
  if ((await usedBytes()) + input.size > MEDIA_LIMITS.companyQuotaBytes)
    return {
      ok: false,
      message: "Espaço de arquivos da empresa esgotado. Arquive ou exclua criativos antigos.",
    };

  // Limpeza: envios abandonados ou arquivos nunca usados, há mais de 6 horas.
  const stale = await prisma.mediaAsset.findMany({
    where: {
      createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) },
      OR: [
        { status: { in: ["AGUARDANDO_ENVIO", "REJEITADO"] } },
        // Enviado mas nunca usado (a pessoa desistiu antes de salvar o criativo).
        { status: "PRONTO", versionId: null, brandLogoOf: { is: null } },
      ],
    },
    select: { id: true, storageKey: true },
    take: 50,
  });
  for (const a of stale) await s.remove(a.storageKey).catch(() => undefined);
  if (stale.length) await prisma.mediaAsset.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });

  const id = randomUUID();
  const companyId = await currentCompanyId();
  const storageKey = storageKeyFor(companyId, id);
  await prisma.mediaAsset.create({
    data: {
      id,
      companyId,
      storageKey,
      originalName: input.name.slice(0, 200) || "arquivo",
      declaredType: input.type,
      declaredSize: BigInt(input.size),
      kind: check.kind,
      purpose: input.purpose,
      uploadedById: userId,
    },
  });
  // R2: o navegador envia direto ao armazenamento (link assinado de 30 min). Local: pelo próprio site.
  const uploadUrl = s.presignPut
    ? await s.presignPut(storageKey, 30 * 60)
    : `/api/v1/admin/marketing/arquivos/${id}`;
  return { ok: true, id, uploadUrl, method: "PUT" };
}

/**
 * Guarda um arquivo GERADO no servidor (arte, página de carrossel, vídeo editado): confere o conteúdo
 * como qualquer envio e já nasce PRONTO. Retorna o registro, ainda solto (sem versão).
 */
export async function storeGenerated(
  userId: string,
  bytes: Uint8Array,
  name: string,
): Promise<MediaResult<{ asset: MediaInfo & { storageKey: string } }>> {
  const s = storage();
  const probed = await probeMedia(bufferReader(bytes), bytes.byteLength);
  if (!probed.ok) return { ok: false, message: probed.reason };
  const limits = checkProbedMedia("criativo", probed, bytes.byteLength);
  if (!limits.ok) return limits;
  if ((await usedBytes()) + bytes.byteLength > MEDIA_LIMITS.companyQuotaBytes)
    return {
      ok: false,
      message: "Espaço de arquivos da empresa esgotado. Arquive ou exclua criativos antigos.",
    };
  const id = randomUUID();
  const companyId = await currentCompanyId();
  const storageKey = storageKeyFor(companyId, id, probed.ext);
  await s.write(storageKey, new Blob([bytes as Uint8Array<ArrayBuffer>]).stream(), bytes.byteLength);
  try {
    const row = await prisma.mediaAsset.create({
      data: {
        id,
        companyId,
        storageKey,
        originalName: safeFileName(name, probed.ext),
        declaredType: probed.mime,
        declaredSize: BigInt(bytes.byteLength),
        mimeType: probed.mime,
        sizeBytes: BigInt(bytes.byteLength),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        kind: probed.kind,
        status: "PRONTO",
        width: probed.width,
        height: probed.height,
        durationMs: probed.kind === "VIDEO" ? probed.durationMs : null,
        purpose: "criativo",
        uploadedById: userId,
        readyAt: new Date(),
      },
    });
    return { ok: true, asset: { ...serialize(row), storageKey } };
  } catch (e) {
    await s.remove(storageKey).catch(() => undefined);
    throw e;
  }
}

/** Lê um arquivo PRONTO da empresa aberta inteiro na memória (fundo de arte, logomarca). */
export async function readAssetBytes(
  id: string,
  maxBytes: number,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const a = await prisma.mediaAsset.findFirst({ where: { id, status: "PRONTO" } });
  if (!a || !a.mimeType || a.sizeBytes == null || Number(a.sizeBytes) > maxBytes) return null;
  const chunks: Uint8Array[] = [];
  const reader = storage().stream(a.storageKey).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), mime: a.mimeType };
}

/** Passo 2 (disco local): grava os bytes. Só quem criou o envio, só enquanto aguarda. */
export async function receiveUpload(
  userId: string,
  id: string,
  body: ReadableStream<Uint8Array> | null,
): Promise<MediaResult> {
  if (!body) return { ok: false, message: "Envio vazio." };
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, uploadedById: userId, status: "AGUARDANDO_ENVIO" },
  });
  if (!asset) return { ok: false, message: "Envio não encontrado ou já concluído." };
  // Aceita até 1 KB acima do declarado e nunca acima do limite do tipo de arquivo.
  const max = Math.min(
    Number(asset.declaredSize) + 1024,
    checkLimitFor(asset.purpose as UploadPurpose, asset.kind),
  );
  try {
    await storage().write(asset.storageKey, body, max);
    return { ok: true };
  } catch (e) {
    await storage().remove(asset.storageKey);
    if (e instanceof TooLargeError) {
      await prisma.mediaAsset.update({
        where: { id },
        data: { status: "REJEITADO", rejectReason: "Maior que o declarado." },
      });
      return { ok: false, message: "O arquivo é maior que o informado ou que o permitido." };
    }
    throw e;
  }
}

const checkLimitFor = (purpose: UploadPurpose, kind: "IMAGEM" | "VIDEO") =>
  purpose === "logo"
    ? MEDIA_LIMITS.logoMaxBytes
    : kind === "IMAGEM"
      ? MEDIA_LIMITS.imageMaxBytes
      : MEDIA_LIMITS.videoMaxBytes;

/** Passo 3: confere o conteúdo e libera o arquivo para uso. */
export async function finalizeUpload(userId: string, id: string): Promise<MediaResult<{ asset: MediaInfo }>> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, uploadedById: userId, status: "AGUARDANDO_ENVIO" },
  });
  if (!asset) return { ok: false, message: "Envio não encontrado ou já concluído." };
  const s = storage();
  const size = await s.size(asset.storageKey);
  const reject = async (message: string) => {
    await s.remove(asset.storageKey);
    await prisma.mediaAsset.update({
      where: { id },
      data: { status: "REJEITADO", rejectReason: message.slice(0, 300) },
    });
    await audit({
      actorId: userId,
      action: "marketing.upload_rejected",
      entity: "MediaAsset",
      entityId: id,
      after: { motivo: message },
    });
    return { ok: false as const, message };
  };
  if (!size) return reject("O arquivo não chegou. Tente enviar de novo.");

  const probed = await probeMedia(s.reader(asset.storageKey), size);
  if (!probed.ok) return reject(probed.reason);
  if (probed.kind !== asset.kind) return reject("O conteúdo do arquivo não corresponde ao tipo informado.");
  const limits = checkProbedMedia(asset.purpose as UploadPurpose, probed, size);
  if (!limits.ok) return reject(limits.message);

  const hash = createHash("sha256");
  const reader = s.stream(asset.storageKey).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }

  // Grava com a extensão real (o nome definitivo nunca depende do nome enviado).
  const finalKey = storageKeyFor(asset.companyId, asset.id, probed.ext);
  await s.copy(asset.storageKey, finalKey);
  await s.remove(asset.storageKey);
  const ready = await prisma.mediaAsset.update({
    where: { id },
    data: {
      storageKey: finalKey,
      status: "PRONTO",
      mimeType: probed.mime,
      sizeBytes: BigInt(size),
      sha256: hash.digest("hex"),
      width: probed.width,
      height: probed.height,
      durationMs: probed.kind === "VIDEO" ? probed.durationMs : null,
      readyAt: new Date(),
    },
  });
  await audit({
    actorId: userId,
    action: "marketing.upload_ready",
    entity: "MediaAsset",
    entityId: id,
    after: { tipo: probed.mime, bytes: size },
  });
  return { ok: true, asset: serialize(ready) };
}

/** Arquivos prontos, enviados por este usuário e ainda soltos (para montar um criativo ou versão). */
export async function claimableAssets(userId: string, ids: string[], purpose: UploadPurpose) {
  const unique = [...new Set(ids)];
  const rows = await prisma.mediaAsset.findMany({
    where: {
      id: { in: unique },
      uploadedById: userId,
      status: "PRONTO",
      versionId: null,
      purpose,
      brandLogoOf: { is: null },
    },
  });
  // Mantém a ordem escolhida pela pessoa (páginas do carrossel).
  return unique.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
}

/** Apaga arquivos do armazenamento (depois que o banco já não os referencia). */
export async function removeStored(keys: string[]) {
  const s = storage();
  for (const k of keys) await s.remove(k).catch(() => undefined);
}
