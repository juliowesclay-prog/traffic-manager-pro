"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { switchCompany } from "@/server/company";

/** Troca a empresa aberta no painel (seletor no topo do menu). */
export async function switchCompanyAction(form: FormData) {
  await requireStaff("admin:access");
  const id = String(form.get("companyId") ?? "").slice(0, 40);
  await switchCompany(id);
  revalidatePath("/admin", "layout");
  const back = String(form.get("voltar") ?? "");
  redirect(back.startsWith("/admin") ? back : "/admin/trafego");
}
