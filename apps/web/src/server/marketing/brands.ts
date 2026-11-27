import "server-only";
import {
  BRAND_FACT_KINDS,
  parseBrand,
  type BrandFactKind,
  type BrandInput,
  type SocialNetwork,
} from "@tmp/core";
import { audit } from "../audit";
import { prisma } from "../db";
import { currentCompanyId } from "../tenant";
import { claimableAssets, removeStored } from "./media";

export type BrandResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

export async function listBrands() {
  return prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      logo: { select: { id: true, width: true, height: true } },
      _count: { select: { facts: true, creatives: true } },
    },
  });
}

export async function getBrand(id: string) {
  const b = await prisma.brand.findFirst({
    where: { id },
    include: {
      logo: { select: { id: true, width: true, height: true, mimeType: true } },
      facts: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!b) return null;
  return { ...b, socials: (b.socials ?? {}) as Partial<Record<SocialNetwork, string>> };
}

export async function createBrand(userId: string, nameInput: string): Promise<BrandResult> {
  const parsed = parseBrand({ name: nameInput, colors: [], ctas: [], socials: {} });
  if (!parsed.ok) return parsed;
  if (await prisma.brand.findFirst({ where: { name: parsed.value.name } }))
    return { ok: false, message: "Já existe uma marca com esse nome nesta empresa." };
  const companyId = await currentCompanyId();
  const b = await prisma.brand.create({ data: { companyId, name: parsed.value.name, createdById: userId } });
  await audit({ actorId: userId, action: "marketing.brand_created", entity: "Brand", entityId: b.id, after: { nome: b.name } });
  return { ok: true, message: `Marca "${b.name}" criada. Agora preencha o kit.`, id: b.id };
}

export async function saveBrand(userId: string, id: string, input: BrandInput): Promise<BrandResult> {
  const b = await prisma.brand.findFirst({ where: { id } });
  if (!b) return { ok: false, message: "Marca não encontrada." };
  const parsed = parseBrand(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  if (v.name !== b.name && (await prisma.brand.findFirst({ where: { name: v.name } })))
    return { ok: false, message: "Já existe uma marca com esse nome nesta empresa." };
  await prisma.brand.updateMany({
    where: { id },
    data: {
      name: v.name,
      website: v.website,
      about: v.about,
      colors: v.colors,
      headingFont: v.headingFont,
      bodyFont: v.bodyFont,
      ctas: v.ctas,
      socials: v.socials,
    },
  });
  await audit({
    actorId: userId,
    action: "marketing.brand_updated",
    entity: "Brand",
    entityId: id,
    before: { nome: b.name, cores: b.colors, ctas: b.ctas },
    after: { nome: v.name, cores: v.colors, ctas: v.ctas },
  });
  return { ok: true, message: "Kit da marca salvo." };
}

/** Troca a logomarca (o arquivo anterior é apagado). */
export async function setBrandLogo(userId: string, brandId: string, assetId: string): Promise<BrandResult> {
  const b = await prisma.brand.findFirst({ where: { id: brandId }, include: { logo: { select: { id: true, storageKey: true } } } });
  if (!b) return { ok: false, message: "Marca não encontrada." };
  const [asset] = await claimableAssets(userId, [assetId], "logo");
  if (!asset) return { ok: false, message: "A logomarca não terminou de enviar. Envie de novo." };
  await prisma.brand.updateMany({ where: { id: brandId }, data: { logoAssetId: asset.id } });
  if (b.logo) {
    await prisma.mediaAsset.deleteMany({ where: { id: b.logo.id } });
    await removeStored([b.logo.storageKey]);
  }
  await audit({ actorId: userId, action: "marketing.brand_logo", entity: "Brand", entityId: brandId, after: { arquivo: asset.id } });
  return { ok: true, message: "Logomarca atualizada." };
}

export async function deleteBrand(userId: string, id: string): Promise<BrandResult> {
  const b = await prisma.brand.findFirst({ where: { id }, include: { logo: { select: { id: true, storageKey: true } } } });
  if (!b) return { ok: false, message: "Marca não encontrada." };
  await prisma.brand.deleteMany({ where: { id } });
  if (b.logo) {
    await prisma.mediaAsset.deleteMany({ where: { id: b.logo.id } });
    await removeStored([b.logo.storageKey]);
  }
  await audit({ actorId: userId, action: "marketing.brand_deleted", entity: "Brand", entityId: id, before: { nome: b.name } });
  return { ok: true, message: `Marca "${b.name}" excluída. Os criativos dela continuam na biblioteca, sem marca.` };
}

// ─── Informações oficiais (a IA só usa as aprovadas) ─────────────────

export async function addFact(
  userId: string,
  brandId: string,
  input: { kind: string; title: string; detail: string },
): Promise<BrandResult> {
  if (!(await prisma.brand.findFirst({ where: { id: brandId }, select: { id: true } })))
    return { ok: false, message: "Marca não encontrada." };
  if (!(BRAND_FACT_KINDS as readonly string[]).includes(input.kind)) return { ok: false, message: "Escolha o tipo." };
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 200) return { ok: false, message: "Título: de 2 a 200 letras." };
  const detail = input.detail.trim().slice(0, 2000) || null;
  const count = await prisma.brandFact.count({ where: { brandId } });
  if (count >= 100) return { ok: false, message: "Limite de 100 informações por marca." };
  const companyId = await currentCompanyId();
  const f = await prisma.brandFact.create({
    data: { companyId, brandId, kind: input.kind as BrandFactKind, title, detail, createdById: userId },
  });
  await audit({ actorId: userId, action: "marketing.fact_added", entity: "BrandFact", entityId: f.id, after: { tipo: f.kind, titulo: title } });
  return { ok: true, message: "Informação cadastrada como rascunho. Ela só será usada pela IA depois de aprovada." };
}

export async function approveFact(userId: string, factId: string): Promise<BrandResult> {
  const r = await prisma.brandFact.updateMany({
    where: { id: factId, status: "RASCUNHO" },
    data: { status: "APROVADO", approvedById: userId, approvedAt: new Date() },
  });
  if (r.count !== 1) return { ok: false, message: "Informação não encontrada ou já aprovada." };
  await audit({ actorId: userId, action: "marketing.fact_approved", entity: "BrandFact", entityId: factId });
  return { ok: true, message: "Informação aprovada: a IA poderá usá-la." };
}

export async function removeFact(userId: string, factId: string): Promise<BrandResult> {
  const f = await prisma.brandFact.findFirst({ where: { id: factId } });
  if (!f) return { ok: false, message: "Informação não encontrada." };
  await prisma.brandFact.deleteMany({ where: { id: factId } });
  await audit({ actorId: userId, action: "marketing.fact_removed", entity: "BrandFact", entityId: factId, before: { titulo: f.title } });
  return { ok: true, message: "Informação removida." };
}
