"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompanyStaff } from "@/server/auth";
import type { CreativeResult } from "@/server/marketing/creatives";
import {
  generateBackgroundAsset,
  refineStudio,
  runStudio,
  saveArt,
  saveCarousel,
} from "@/server/marketing/studio";
import { cancelJob, requestEdit, requestTranscription } from "@/server/marketing/video";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const optId = (f: FormData, k: string) => (UUID.test(str(f, k)) ? str(f, k) : null);
const ESTUDIO = "/admin/marketing/estudio";

export type SimpleResult = { ok: false; message: string };

export async function studioAction(_: SimpleResult | undefined, f: FormData): Promise<SimpleResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await runStudio(user.id, {
    brandId: optId(f, "marca"),
    objetivo: str(f, "objetivo"),
    tom: str(f, "tom"),
    publico: str(f, "publico"),
    assunto: str(f, "assunto"),
    pedido: str(f, "pedido"),
  });
  if (!r.ok) return r;
  revalidatePath(ESTUDIO);
  redirect(`${ESTUDIO}?r=${r.id}`);
}

export async function refineAction(_: SimpleResult | undefined, f: FormData): Promise<SimpleResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "id");
  if (!id) return { ok: false, message: "Resultado inválido." };
  const r = await refineStudio(user.id, id, str(f, "ajuste"));
  if (!r.ok) return r;
  revalidatePath(ESTUDIO);
  redirect(`${ESTUDIO}?r=${r.id}`);
}

function specFrom(f: FormData): Record<string, unknown> | null {
  try {
    const v = JSON.parse(str(f, "spec"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveArtAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const spec = specFrom(f);
  if (!spec) return { ok: false, message: "Dados da arte inválidos." };
  const r = await saveArt(user.id, spec, {
    creativeId: optId(f, "criativo"),
    name: str(f, "nome"),
    note: str(f, "nota"),
  });
  if (r.ok) revalidatePath("/admin/marketing/biblioteca");
  return r;
}

export async function saveCarouselAction(
  _: CreativeResult | undefined,
  f: FormData,
): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const spec = specFrom(f);
  if (!spec) return { ok: false, message: "Dados do carrossel inválidos." };
  const r = await saveCarousel(user.id, spec, {
    creativeId: optId(f, "criativo"),
    name: str(f, "nome"),
    note: str(f, "nota"),
  });
  if (r.ok) revalidatePath("/admin/marketing/biblioteca");
  return r;
}

/** Gera a foto de fundo por IA (chamada direta do editor, sem formulário). */
export async function generateImageAction(prompt: string, format: string) {
  const { user } = await requireCompanyStaff("marketing:manage");
  return generateBackgroundAsset(user.id, String(prompt ?? ""), String(format ?? ""));
}

// ─── Editor de vídeos (Etapa 4) ─────────────────

export type VideoActionResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

export async function videoEditAction(
  _: VideoActionResult | undefined,
  f: FormData,
): Promise<VideoActionResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "criativo");
  const spec = specFrom(f);
  if (!id || !spec) return { ok: false, message: "Pedido inválido." };
  const r = await requestEdit(user.id, id, spec);
  if (r.ok) revalidatePath("/admin/marketing/videos");
  return r;
}

export async function transcribeAction(
  _: VideoActionResult | undefined,
  f: FormData,
): Promise<VideoActionResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "criativo");
  if (!id) return { ok: false, message: "Vídeo inválido." };
  const r = await requestTranscription(user.id, id);
  if (r.ok) revalidatePath("/admin/marketing/videos");
  return r;
}

export async function cancelVideoJobAction(
  _: VideoActionResult | undefined,
  f: FormData,
): Promise<VideoActionResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const id = optId(f, "tarefa");
  if (!id) return { ok: false, message: "Pedido inválido." };
  const r = await cancelJob(user.id, id);
  if (r.ok) revalidatePath("/admin/marketing/videos");
  return r;
}
