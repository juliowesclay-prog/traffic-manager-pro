"use server";

import { redirect } from "next/navigation";
import { changePassword, type AccountResult } from "@/server/account";
import { requireStaff } from "@/server/auth";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.slice(0, 128) : "");

export async function staffPasswordAction(
  _: AccountResult | undefined,
  form: FormData,
): Promise<AccountResult> {
  const { user } = await requireStaff("admin:access", { allowPasswordChange: true });
  const wasForced = user.mustChangePassword;
  const result = await changePassword(
    user.id,
    { current: str(form.get("current")), next: str(form.get("next")), confirm: str(form.get("confirm")) },
    "staff",
  );
  if (result.ok && wasForced) redirect("/admin");
  return result;
}
