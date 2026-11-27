"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireCompanyStaff } from "@/server/auth";
import type { CreativeResult } from "@/server/marketing/creatives";
import {
  CANVA_STATE_COOKIE,
  disconnectCanva,
  importDesign,
  startCanvaConnect,
  type CanvaFormat,
  type CanvaResult,
} from "@/server/marketing/canva";

export type CanvaStart = { ok: boolean; message: string; next?: string };

export async function connectCanvaAction(_: CanvaStart | undefined, _f: FormData): Promise<CanvaStart> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await startCanvaConnect(user.id);
  if (!r.ok) return r;
  (await cookies()).set(CANVA_STATE_COOKIE, r.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/admin/marketing/canva",
    maxAge: 10 * 60,
  });
  return { ok: true, message: "Abrindo o Canva…", next: r.url };
}

export async function disconnectCanvaAction(_: CanvaResult | undefined, _f: FormData): Promise<CanvaResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await disconnectCanva(user.id);
  revalidatePath("/admin/marketing/canva");
  return r;
}

export async function importCanvaAction(_: CreativeResult | undefined, f: FormData): Promise<CreativeResult> {
  const { user } = await requireCompanyStaff("marketing:manage");
  const r = await importDesign(
    user.id,
    String(f.get("design") ?? ""),
    String(f.get("titulo") ?? ""),
    String(f.get("formato") ?? "png") as CanvaFormat,
  );
  if (r.ok) revalidatePath("/admin/marketing/biblioteca");
  return r;
}
