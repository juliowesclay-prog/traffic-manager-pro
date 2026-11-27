"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CREATIVE_STATUSES, SOCIAL_NETWORKS, type CreativeStatus, type SocialNetwork } from "@tmp/core";
import { requireCompanyStaff } from "@/server/auth";
import {
  addFact,
  approveFact,
  createBrand,
  deleteBrand,
  removeFact,
  saveBrand,
  setBrandLogo,
  type BrandResult,
} from "@/server/marketing/brands";
import {
  addVersion,
  changeCreativeStatus,
  createCreative,
  deleteCreative,
  duplicateCreative,
  updateCreativeDetails,
  type CreativeResult,
} from "@/server/marketing/creatives";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const optId = (f: FormData, k: string) => {
  const v = str(f, k);
  return UUID.test(v) ? v : null;
};
const ids = (f: FormData, k: string) => f.getAll(k).map(String).filter((v) => UUID.test(v));
const LIB = "/admin/marketing/biblioteca";

// ─── Biblioteca ─────────────────

export async function createCreativeAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await createCreative(user.id, {
    name: str(f, "nome"),
    brandId: optId(f, "marca"),
    campaignId: optId(f, "campanha"),
    assetIds: ids(f, "arquivo"),
  });
  if (r.ok) revalidatePath(LIB);
  return r;
}

export async function addVersionAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Criativo inválido." };
  const r = await addVersion(user.id, id, { assetIds: ids(f, "arquivo"), note: str(f, "nota") });
  if (r.ok) revalidatePath(`${LIB}/${id}`);
  return r;
}

export async function updateCreativeAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Criativo inválido." };
  const r = await updateCreativeDetails(user.id, id, {
    name: str(f, "nome"),
    brandId: optId(f, "marca"),
    campaignId: optId(f, "campanha"),
  });
  if (r.ok) revalidatePath(`${LIB}/${id}`);
  return r;
}

export async function changeStatusAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user, roles } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  const to = str(f, "status");
  if (!id || !(CREATIVE_STATUSES as readonly string[]).includes(to)) return { ok: false, message: "Escolha o status." };
  const r = await changeCreativeStatus(user.id, roles, id, to as CreativeStatus);
  if (r.ok) revalidatePath(`${LIB}/${id}`);
  return r;
}

export async function duplicateCreativeAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Criativo inválido." };
  const r = await duplicateCreative(user.id, id);
  if (r.ok) revalidatePath(LIB);
  return r;
}

export async function deleteCreativeAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Criativo inválido." };
  if (f.get("confirmo") !== "on") return { ok: false, message: "Marque a confirmação para excluir." };
  const r = await deleteCreative(user.id, id);
  if (!r.ok) return r;
  revalidatePath(LIB);
  // A página do criativo deixa de existir: volta para a biblioteca pelo servidor.
  redirect(LIB);
}

// ─── Kit da marca ─────────────────

export async function createBrandAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await createBrand(user.id, str(f, "nome"));
  if (r.ok) revalidatePath("/admin/marketing/marca");
  return r;
}

export async function saveBrandAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Marca inválida." };
  const socials = Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, str(f, `rede_${n}`)])) as Record<SocialNetwork, string>;
  const r = await saveBrand(user.id, id, {
    name: str(f, "nome"),
    website: str(f, "site"),
    about: str(f, "sobre"),
    colors: f.getAll("cor").map(String),
    headingFont: str(f, "fonte_titulos") || undefined,
    bodyFont: str(f, "fonte_textos") || undefined,
    ctas: str(f, "ctas").split("\n"),
    socials,
  });
  if (r.ok) revalidatePath(`/admin/marketing/marca/${id}`);
  return r;
}

export async function setLogoAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  const asset = ids(f, "arquivo")[0];
  if (!id || !asset) return { ok: false, message: "Escolha a imagem da logomarca." };
  const r = await setBrandLogo(user.id, id, asset);
  if (r.ok) revalidatePath(`/admin/marketing/marca/${id}`);
  return r;
}

export async function deleteBrandAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Marca inválida." };
  if (f.get("confirmo") !== "on") return { ok: false, message: "Marque a confirmação para excluir." };
  const r = await deleteBrand(user.id, id);
  if (!r.ok) return r;
  revalidatePath("/admin/marketing/marca");
  redirect("/admin/marketing/marca");
}

export async function addFactAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Marca inválida." };
  const r = await addFact(user.id, id, { kind: str(f, "tipo"), title: str(f, "titulo"), detail: str(f, "detalhe") });
  if (r.ok) revalidatePath(`/admin/marketing/marca/${id}`);
  return r;
}

export async function approveFactAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:approve");
  const id = optId(f, "fato");
  if (!id) return { ok: false, message: "Informação inválida." };
  const r = await approveFact(user.id, id);
  revalidatePath(`/admin/marketing/marca/${optId(f, "marca") ?? ""}`);
  return r;
}

export async function removeFactAction(_: BrandResult | undefined, f: FormData): Promise<BrandResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "fato");
  if (!id) return { ok: false, message: "Informação inválida." };
  const r = await removeFact(user.id, id);
  revalidatePath(`/admin/marketing/marca/${optId(f, "marca") ?? ""}`);
  return r;
}
