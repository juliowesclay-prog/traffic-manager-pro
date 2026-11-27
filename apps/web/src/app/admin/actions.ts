"use server";

import { redirect } from "next/navigation";
import { staffPasswordLogin } from "@/server/staff";

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export type AdminFormState = { message?: string } | undefined;

export async function staffLoginAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const area = "admin" as const;
  const result = await staffPasswordLogin(str(form.get("email")), str(form.get("password"), 128), area);
  if (!result.ok) return { message: result.message };
  redirect(result.next ?? "/admin");
}
