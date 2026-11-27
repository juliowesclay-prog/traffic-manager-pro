import "server-only";
import { randomUUID } from "node:crypto";
import {
  creativeKindFor,
  creativeStatusChange,
  CREATIVE_KIND_LABELS,
  CREATIVE_STATUSES,
  CREATIVE_KINDS,
  parseCreativeName,
  type CreativeKind,
  type CreativeStatus,
  type Role,
} from "@tmp/core";
import { audit } from "../audit";
import { prisma } from "../db";
import { currentCompanyId } from "../tenant";
import { claimableAssets, removeStored } from "./media";
import { storage, storageKeyFor } from "./storage";

export type CreativeResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

const assetSelect = {
  id: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  durationMs: true,
  position: true,
  originalName: true,
} as const;

/** Biblioteca: busca por nome, filtro por tipo e status. Arquivados só quando pedidos. */
export async function listCreatives(filters: { q?: string; kind?: string; status?: string }) {
  const kind = (CREATIVE_KINDS as readonly string[]).includes(filters.kind ?? "") ? (filters.kind as CreativeKind) : undefined;
  const status = (CREATIVE_STATUSES as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as CreativeStatus)
    : undefined;
  const q = filters.q?.trim().slice(0, 80);
  const rows = await prisma.creative.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : { status: { not: "ARQUIVADO" } }),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      brand: { select: { name: true } },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { assets: { orderBy: { position: "asc" }, select: assetSelect } },
      },
    },
  });
  return rows.map((c) => ({ ...c, cover: c.versions[0]?.assets[0] ?? null, pages: c.versions[0]?.assets.length ?? 0 }));
}

export async function getCreative(id: string) {
  const c = await prisma.creative.findFirst({
    where: { id },
    include: {
      brand: { select: { id: true, name: true } },
      versions: {
        orderBy: { number: "desc" },
        include: { assets: { orderBy: { position: "asc" }, select: assetSelect } },
      },
    },
  });
  if (!c) return null;
  const [campaign, people] = await Promise.all([
    c.campaignId ? prisma.metaCampaign.findFirst({ where: { id: c.campaignId }, select: { id: true, name: true } }) : null,
    namesOf([c.createdById, c.approvedById, ...c.versions.map((v) => v.createdById)]),
  ]);
  return { ...c, campaign, people };
}

async function namesOf(ids: (string | null)[]) {
  const { prisma: base } = await import("@tmp/db");
  const users = await base.user.findMany({
    where: { id: { in: ids.filter((i): i is string => !!i) } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}

/** Marca e campanha só valem se forem da empresa aberta (o filtro automático garante). */
async function checkLinks(brandId: string | null, campaignId: string | null): Promise<string | null> {
  if (brandId && !(await prisma.brand.findFirst({ where: { id: brandId }, select: { id: true } })))
    return "Marca não encontrada.";
  if (campaignId && !(await prisma.metaCampaign.findFirst({ where: { id: campaignId }, select: { id: true } })))
    return "Campanha não encontrada.";
  return null;
}

export async function createCreative(
  userId: string,
  input: { name: string; brandId: string | null; campaignId: string | null; assetIds: string[] },
): Promise<CreativeResult> {
  const name = parseCreativeName(input.name);
  if (!name) return { ok: false, message: "Nome do criativo: de 2 a 120 letras." };
  const linkError = await checkLinks(input.brandId, input.campaignId);
  if (linkError) return { ok: false, message: linkError };
  const assets = await claimableAssets(userId, input.assetIds, "criativo");
  if (assets.length !== new Set(input.assetIds).size)
    return { ok: false, message: "Algum arquivo não terminou de enviar ou já foi usado. Envie de novo." };
  const kind = creativeKindFor(assets.map((a) => a.kind));
  if (!kind.ok) return kind;

  const companyId = await currentCompanyId();
  const id = randomUUID();
  const versionId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.creative.create({
      data: {
        id,
        companyId,
        name,
        kind: kind.kind,
        brandId: input.brandId,
        campaignId: input.campaignId,
        createdById: userId,
      },
    });
    await tx.creativeVersion.create({
      data: { id: versionId, companyId, creativeId: id, number: 1, note: "Arquivo original importado", createdById: userId },
    });
    for (const [position, a] of assets.entries())
      await tx.mediaAsset.update({ where: { id: a.id }, data: { versionId, position } });
  });
  await audit({
    actorId: userId,
    action: "marketing.creative_created",
    entity: "Creative",
    entityId: id,
    after: { nome: name, tipo: kind.kind, arquivos: assets.length },
  });
  return { ok: true, message: `${CREATIVE_KIND_LABELS[kind.kind]} "${name}" adicionado à biblioteca.`, id };
}

/** Versão nova (o original e as anteriores ficam guardados). Criativo aprovado volta para edição. */
export async function addVersion(
  userId: string,
  creativeId: string,
  input: { assetIds: string[]; note: string },
): Promise<CreativeResult> {
  const c = await prisma.creative.findFirst({ where: { id: creativeId } });
  if (!c) return { ok: false, message: "Criativo não encontrado." };
  if (c.status === "ENVIADO_META" || c.status === "ARQUIVADO")
    return { ok: false, message: "Criativo enviado à Meta ou arquivado não recebe versões. Duplique para continuar." };
  const assets = await claimableAssets(userId, input.assetIds, "criativo");
  if (assets.length !== new Set(input.assetIds).size)
    return { ok: false, message: "Algum arquivo não terminou de enviar ou já foi usado. Envie de novo." };
  const kind = creativeKindFor(assets.map((a) => a.kind));
  if (!kind.ok) return kind;
  if (kind.kind !== c.kind)
    return { ok: false, message: `Este criativo é ${CREATIVE_KIND_LABELS[c.kind].toLowerCase()}: a versão nova precisa ser do mesmo tipo.` };

  const number = c.currentVersion + 1;
  const versionId = randomUUID();
  const companyId = await currentCompanyId();
  const updated = await prisma.$transaction(async (tx) => {
    // Só avança se ninguém criou outra versão ao mesmo tempo.
    const r = await tx.creative.updateMany({
      where: { id: c.id, currentVersion: c.currentVersion },
      data: {
        currentVersion: number,
        ...(c.status === "APROVADO" || c.status === "AGUARDANDO_APROVACAO"
          ? { status: "EM_EDICAO", approvedVersion: null, approvedById: null, approvedAt: null }
          : {}),
      },
    });
    if (r.count !== 1) return false;
    await tx.creativeVersion.create({
      data: { id: versionId, companyId, creativeId: c.id, number, note: input.note.trim().slice(0, 300) || null, createdById: userId },
    });
    for (const [position, a] of assets.entries())
      await tx.mediaAsset.update({ where: { id: a.id }, data: { versionId, position } });
    return true;
  });
  if (!updated) return { ok: false, message: "Outra pessoa alterou este criativo agora. Recarregue a página." };
  await audit({ actorId: userId, action: "marketing.version_added", entity: "Creative", entityId: c.id, after: { versao: number } });
  return {
    ok: true,
    message:
      c.status === "APROVADO"
        ? `Versão ${number} criada. O criativo voltou para "Em edição" e precisa de nova aprovação.`
        : `Versão ${number} criada.`,
  };
}

export async function updateCreativeDetails(
  userId: string,
  id: string,
  input: { name: string; brandId: string | null; campaignId: string | null },
): Promise<CreativeResult> {
  const c = await prisma.creative.findFirst({ where: { id } });
  if (!c) return { ok: false, message: "Criativo não encontrado." };
  const name = parseCreativeName(input.name);
  if (!name) return { ok: false, message: "Nome do criativo: de 2 a 120 letras." };
  const linkError = await checkLinks(input.brandId, input.campaignId);
  if (linkError) return { ok: false, message: linkError };
  await prisma.creative.updateMany({ where: { id }, data: { name, brandId: input.brandId, campaignId: input.campaignId } });
  await audit({
    actorId: userId,
    action: "marketing.creative_updated",
    entity: "Creative",
    entityId: id,
    before: { nome: c.name, marca: c.brandId, campanha: c.campaignId },
    after: { nome: name, marca: input.brandId, campanha: input.campaignId },
  });
  return { ok: true, message: "Dados do criativo salvos." };
}

export async function changeCreativeStatus(
  userId: string,
  roles: Role[],
  id: string,
  to: CreativeStatus,
): Promise<CreativeResult> {
  const c = await prisma.creative.findFirst({ where: { id } });
  if (!c) return { ok: false, message: "Criativo não encontrado." };
  const rule = creativeStatusChange(roles, c.status, to);
  if (!rule.ok) return rule;
  const approval =
    to === "APROVADO"
      ? { approvedById: userId, approvedAt: new Date(), approvedVersion: c.currentVersion }
      : { approvedById: null, approvedAt: null, approvedVersion: null };
  // Arquivar um criativo já enviado à Meta mantém o registro de aprovação.
  const keepApproval = c.status === "ENVIADO_META" && to === "ARQUIVADO";
  const r = await prisma.creative.updateMany({
    where: { id, status: c.status },
    data: { status: to, ...(keepApproval ? {} : approval) },
  });
  if (r.count !== 1) return { ok: false, message: "Outra pessoa alterou este criativo agora. Recarregue a página." };
  await audit({
    actorId: userId,
    action: to === "APROVADO" ? "marketing.creative_approved" : "marketing.creative_status",
    entity: "Creative",
    entityId: id,
    before: { status: c.status },
    after: { status: to, versao: c.currentVersion },
  });
  return { ok: true, message: to === "APROVADO" ? `Versão ${c.currentVersion} aprovada.` : "Status alterado." };
}

/** Duplica a versão atual num criativo novo (rascunho), com cópia dos arquivos. */
export async function duplicateCreative(userId: string, id: string): Promise<CreativeResult> {
  const c = await prisma.creative.findFirst({
    where: { id },
    include: { versions: { orderBy: { number: "desc" }, take: 1, include: { assets: { orderBy: { position: "asc" } } } } },
  });
  const current = c?.versions[0];
  if (!c || !current) return { ok: false, message: "Criativo não encontrado." };
  const companyId = await currentCompanyId();
  const newId = randomUUID();
  const versionId = randomUUID();
  const copies = current.assets.map((a) => {
    const assetId = randomUUID();
    const ext = a.storageKey.split(".").pop();
    return { from: a, id: assetId, key: storageKeyFor(companyId, assetId, ext) };
  });
  const s = storage();
  for (const cp of copies) await s.copy(cp.from.storageKey, cp.key);
  const name = `${c.name.slice(0, 108)} (cópia)`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.creative.create({
        data: { id: newId, companyId, name, kind: c.kind, origin: c.origin, brandId: c.brandId, campaignId: c.campaignId, createdById: userId },
      });
      await tx.creativeVersion.create({
        data: { id: versionId, companyId, creativeId: newId, number: 1, note: `Cópia de "${c.name}" (versão ${current.number})`, createdById: userId },
      });
      for (const cp of copies) {
        const a = cp.from;
        await tx.mediaAsset.create({
          data: {
            id: cp.id,
            companyId,
            storageKey: cp.key,
            originalName: a.originalName,
            declaredType: a.declaredType,
            declaredSize: a.declaredSize,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            sha256: a.sha256,
            kind: a.kind,
            status: "PRONTO",
            width: a.width,
            height: a.height,
            durationMs: a.durationMs,
            purpose: "criativo",
            position: a.position,
            uploadedById: userId,
            readyAt: new Date(),
            versionId,
          },
        });
      }
    });
  } catch (e) {
    await removeStored(copies.map((cp) => cp.key));
    throw e;
  }
  await audit({ actorId: userId, action: "marketing.creative_duplicated", entity: "Creative", entityId: newId, after: { origem: c.id } });
  return { ok: true, message: `Cópia criada: "${name}".`, id: newId };
}

/** Exclui o criativo, todas as versões e os arquivos. Criativo enviado à Meta não pode ser excluído (só arquivado). */
export async function deleteCreative(userId: string, id: string): Promise<CreativeResult> {
  const c = await prisma.creative.findFirst({
    where: { id },
    include: { versions: { include: { assets: { select: { storageKey: true } } } } },
  });
  if (!c) return { ok: false, message: "Criativo não encontrado." };
  if (c.status === "ENVIADO_META")
    return { ok: false, message: "Criativo já enviado à Meta fica guardado para histórico. Use Arquivar." };
  const keys = c.versions.flatMap((v) => v.assets.map((a) => a.storageKey));
  await prisma.creative.deleteMany({ where: { id } });
  await removeStored(keys);
  await audit({
    actorId: userId,
    action: "marketing.creative_deleted",
    entity: "Creative",
    entityId: id,
    before: { nome: c.name, tipo: c.kind, versoes: c.versions.length, arquivos: keys.length },
  });
  return { ok: true, message: `"${c.name}" foi excluído.` };
}

/** Criativos aprovados (prontos para o envio à Meta, Etapa 6). */
export async function approvedCreatives() {
  return prisma.creative.findMany({
    where: { status: "APROVADO" },
    orderBy: { approvedAt: "desc" },
    take: 50,
    select: { id: true, name: true, kind: true, approvedVersion: true, approvedAt: true },
  });
}

/** Números da biblioteca (painel do módulo). */
export async function libraryCounts() {
  const rows = await prisma.creative.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<CreativeStatus, number>>;
}
