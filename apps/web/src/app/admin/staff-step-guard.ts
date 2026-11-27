import "server-only";
import { redirect } from "next/navigation";
import { can } from "@tmp/core";
import { getAuth } from "@/server/auth";

/** Páginas intermediárias do login (senha OK, autenticador pendente) do painel. */
export async function requireStaffPendingMfa(_area: "admin" = "admin") {
  const base = "/admin";
  const auth = await getAuth();
  if (!auth || !can(auth.roles, "admin:access"))
    redirect(`${base}/entrar`);
  if (auth.session.mfaVerified) redirect(base);
  return auth;
}
