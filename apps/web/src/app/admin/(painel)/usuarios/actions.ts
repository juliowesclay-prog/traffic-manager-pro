"use server";

import { revalidatePath } from "next/cache";
import {
  createStaff,
  resetPassword,
  setBlocked,
  updateRoles,
  type AdminResult,
} from "@/server/admin-users";
import { requireStaff } from "@/server/auth";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.slice(0, 200) : "");
const roles = (form: FormData) => form.getAll("roles").map((v) => String(v));

export async function createStaffAction(_: AdminResult | undefined, form: FormData): Promise<AdminResult> {
  const { user } = await requireStaff("users:manage");
  const result = await createStaff(user.id, {
    name: str(form.get("name")),
    email: str(form.get("email")),
    roles: roles(form),
  });
  revalidatePath("/admin/usuarios");
  return result;
}

export async function manageStaffAction(_: AdminResult | undefined, form: FormData): Promise<AdminResult> {
  const { user } = await requireStaff("users:manage");
  const id = str(form.get("userId"));
  const op = str(form.get("op"));
  const result =
    op === "roles"
      ? await updateRoles(user.id, id, roles(form))
      : op === "block"
        ? await setBlocked(user.id, id, true)
        : op === "unblock"
          ? await setBlocked(user.id, id, false)
          : op === "reset-password"
            ? await resetPassword(user.id, id)
            : ({ ok: false, message: "Ação desconhecida." } as const);
  revalidatePath(`/admin/usuarios/${id}`);
  return result;
}
