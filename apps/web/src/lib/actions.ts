"use server";

import { redirect } from "next/navigation";
import { logout } from "@/server/staff";

/** Sair do painel. */
export async function logoutAction(formData: FormData) {
  await logout();
  const destino = formData.get("destino");
  void destino;
  redirect("/admin/entrar");
}
