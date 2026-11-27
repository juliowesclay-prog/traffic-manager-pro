"use server";

import { redirect } from "next/navigation";
import { confirmTotp, staffPasswordLogin } from "@/server/staff";

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export type AdminFormState = { message?: string } | undefined;

export async function staffLoginAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const area = "admin" as const;
  const result = await staffPasswordLogin(str(form.get("email")), str(form.get("password"), 128), area);
  if (!result.ok) return { message: result.message };
  redirect(result.next ?? "/admin");
}

export async function enrollMfaAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const result = await confirmTotp(str(form.get("code"), 10), "enroll");
  if (!result.ok) return { message: result.message };
  redirect(result.next ?? "/admin");
}

export async function verifyMfaAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const result = await confirmTotp(str(form.get("code"), 10), "verify");
  if (!result.ok) return { message: result.message };
  redirect(result.next ?? "/admin");
}
