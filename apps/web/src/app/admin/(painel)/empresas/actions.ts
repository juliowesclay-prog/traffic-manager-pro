"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth";
import {
  createApiKey,
  createCompany,
  grantCompanyAccess,
  revokeApiKey,
  revokeCompanyAccess,
  setCompanyStatus,
  type CompanyResult,
} from "@/server/company";

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

export async function createCompanyAction(_: CompanyResult | undefined, form: FormData): Promise<CompanyResult> {
  const { user } = await requireStaff("companies:manage");
  const r = await createCompany(user.id, str(form.get("name"), 80));
  revalidatePath("/admin", "layout");
  return r;
}

export async function manageCompanyAction(_: CompanyResult | undefined, form: FormData): Promise<CompanyResult> {
  const { user } = await requireStaff("companies:manage");
  const companyId = str(form.get("companyId"), 40);
  const op = str(form.get("op"), 20);
  const r =
    op === "grant"
      ? await grantCompanyAccess(user.id, companyId, str(form.get("email")))
      : op === "revoke"
        ? await revokeCompanyAccess(user.id, companyId, str(form.get("userId"), 40))
        : op === "key-create"
          ? await createApiKey(user.id, companyId, str(form.get("name"), 60))
          : op === "key-revoke"
            ? await revokeApiKey(user.id, companyId, str(form.get("keyId"), 40))
            : op === "suspend"
              ? await setCompanyStatus(user.id, companyId, false)
              : op === "reactivate"
                ? await setCompanyStatus(user.id, companyId, true)
                : ({ ok: false, message: "Operação desconhecida." } as const);
  revalidatePath(`/admin/empresas/${companyId}`);
  revalidatePath("/admin", "layout");
  return r;
}
