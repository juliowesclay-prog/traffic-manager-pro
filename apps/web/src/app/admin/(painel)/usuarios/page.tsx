import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { ASSIGNABLE_ROLES, listStaff } from "@/server/admin-users";
import { requireStaff } from "@/server/auth";
import { CreateStaffForm } from "./forms";

export const metadata: Metadata = { title: "Equipe e acessos" };

export default async function StaffPage() {
  await requireStaff("users:manage");
  const staff = await listStaff();
  const roleOptions = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <AdminPageTitle
        title="Equipe e acessos"
        subtitle="Quem pode entrar no painel e o que cada pessoa pode fazer."
      />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Tabela da equipe">
          <table className="w-full min-w-[40rem] text-left text-base">
            <caption className="sr-only">Usuários da equipe</caption>
            <thead className="bg-navy-50 text-sm text-navy">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Nome
                </th>
                <th scope="col" className="px-4 py-3">
                  Perfis
                </th>
                <th scope="col" className="px-4 py-3">
                  Autenticador
                </th>
                <th scope="col" className="px-4 py-3">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/usuarios/${u.id}`}
                      className="font-bold text-navy underline underline-offset-4"
                    >
                      {u.name}
                    </Link>
                    <span className="block text-sm text-ink-soft">{u.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    {u.roles
                      .map((r) => ROLE_LABELS[r.role as Role])
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3">{u.mfaEnabledAt ? "Configurado" : "Pendente"}</td>
                  <td className="px-4 py-3">
                    {u.status === "BLOCKED" ? (
                      <span className="font-bold text-red-dark">Bloqueado</span>
                    ) : u.mustChangePassword ? (
                      "Aguardando 1º acesso"
                    ) : (
                      "Ativo"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-navy">Novo usuário da equipe</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Uma senha provisória é gerada e mostrada uma única vez.
          </p>
          <div className="mt-5">
            <CreateStaffForm roles={roleOptions} />
          </div>
        </Card>
      </div>
    </>
  );
}
