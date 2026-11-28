"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompanyStaff } from "@/server/auth";
import { linkExistingAd, sendToMeta, unlinkAd, type SendResult } from "@/server/marketing/meta-send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function sendToMetaAction(_: SendResult | undefined, f: FormData): Promise<SendResult> {
  const { user } = await requireCompanyStaff("marketing:approve");
  const id = str(f, "criativo");
  if (!UUID.test(id)) return { ok: false, message: "Criativo inválido." };
  const r = await sendToMeta(
    user.id,
    id,
    {
      adSetId: str(f, "conjunto"),
      pageId: str(f, "pagina"),
      instagramId: str(f, "instagram"),
      adName: str(f, "nome"),
      primaryText: str(f, "texto"),
      headline: str(f, "titulo"),
      description: str(f, "descricao"),
      link: str(f, "link"),
      callToAction: str(f, "cta"),
    },
    f.get("confirmo") === "on",
  );
  revalidatePath("/admin/marketing/enviar-meta");
  revalidatePath(`/admin/marketing/biblioteca/${id}`);
  if (r.ok && r.id) redirect(`/admin/marketing/enviar-meta?enviado=${r.id}`);
  return r;
}

export async function linkAdAction(_: SendResult | undefined, f: FormData): Promise<SendResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = str(f, "criativo");
  const ad = str(f, "anuncio").trim();
  if (!UUID.test(id) || !/^\d{1,30}$/.test(ad)) return { ok: false, message: "Escolha o anúncio." };
  const r = await linkExistingAd(user.id, id, ad);
  if (r.ok) revalidatePath(`/admin/marketing/biblioteca/${id}`);
  return r;
}

export async function unlinkAdAction(_: SendResult | undefined, f: FormData): Promise<SendResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = str(f, "criativo");
  const ad = str(f, "anuncio");
  if (!UUID.test(id) || !/^\d{1,30}$/.test(ad)) return { ok: false, message: "Vínculo inválido." };
  const r = await unlinkAd(user.id, id, ad);
  if (r.ok) revalidatePath(`/admin/marketing/biblioteca/${id}`);
  return r;
}
