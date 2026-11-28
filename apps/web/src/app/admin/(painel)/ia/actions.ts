"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompanyStaff } from "@/server/auth";
import { removeAiKey, saveAiKey, type AiKeyResult } from "@/server/ai-credentials";

export async function saveAiKeyAction(_: AiKeyResult | undefined, f: FormData): Promise<AiKeyResult> {
  const { user } = await requireCompanyStaff("traffic:approve");
  const r = await saveAiKey(user.id, {
    provider: String(f.get("provedor") ?? ""),
    key: String(f.get("chave") ?? ""),
    model: String(f.get("modelo") ?? ""),
  });
  if (r.ok) revalidatePath("/admin/ia");
  return r;
}

export async function removeAiKeyAction(_: AiKeyResult | undefined, _f: FormData): Promise<AiKeyResult> {
  const { user } = await requireCompanyStaff("traffic:approve");
  const r = await removeAiKey(user.id);
  revalidatePath("/admin/ia");
  if (r.ok) redirect("/admin/ia?removida=1");
  return r;
}
