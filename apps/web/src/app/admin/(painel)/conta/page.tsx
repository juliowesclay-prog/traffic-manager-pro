import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Alert } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireStaff } from "@/server/auth";
import { StaffPasswordForm } from "./form";

export const metadata: Metadata = { title: "Minha senha" };

export default async function StaffAccountPage() {
  const { user } = await requireStaff("admin:access", { allowPasswordChange: true });
  return (
    <>
      <AdminPageTitle title="Minha senha" subtitle={user.email ?? undefined} />
      {user.mustChangePassword ? (
        <Alert
          tone="warning"
          icon={<KeyRound className="size-7" />}
          title="Troque a senha provisória para continuar"
          className="mb-6"
        >
          Você entrou com uma senha criada por um administrador. Escolha uma senha só sua.
        </Alert>
      ) : null}
      <StaffPasswordForm forced={user.mustChangePassword} />
    </>
  );
}
