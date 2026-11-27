import type { Metadata } from "next";
import { can } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { LinkButton } from "@/components/link-button";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Nenhuma empresa" };

export default async function NoCompanyPage() {
  const { roles } = await requireStaff("admin:access");
  const admin = can(roles, "companies:manage");
  return (
    <>
      <AdminPageTitle title="Nenhuma empresa liberada" />
      <Card className="grid max-w-2xl gap-4 p-6">
        <p className="text-lg">
          {admin
            ? "Ainda não há empresas cadastradas. Cadastre a primeira para conectar a conta de anúncios da Meta."
            : "Seu usuário ainda não tem acesso a nenhuma empresa. Peça a um superadministrador para liberar."}
        </p>
        {admin ? (
          <LinkButton href="/admin/empresas" variant="primary" className="justify-self-start">
            Cadastrar empresa
          </LinkButton>
        ) : null}
      </Card>
    </>
  );
}
