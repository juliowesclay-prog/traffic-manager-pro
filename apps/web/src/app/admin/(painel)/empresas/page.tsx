import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@tmp/db";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireStaff } from "@/server/auth";
import { CreateCompanyForm } from "./forms";

export const metadata: Metadata = { title: "Empresas" };

export default async function CompaniesPage() {
  await requireStaff("companies:manage");
  const companies = await prisma.company.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: true, apiKeys: { where: { revokedAt: null } } } } },
  });
  return (
    <>
      <AdminPageTitle
        title="Empresas"
        subtitle="Cada empresa tem sua conexão com a Meta, suas campanhas, vendas e configurações, separadas das demais."
      />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Tabela de empresas">
          <table className="w-full min-w-[36rem] text-left text-base">
            <caption className="sr-only">Empresas cadastradas</caption>
            <thead className="bg-navy-50 text-sm text-navy">
              <tr>
                <th scope="col" className="px-4 py-3">Empresa</th>
                <th scope="col" className="px-4 py-3">Pessoas com acesso</th>
                <th scope="col" className="px-4 py-3">Chaves da API</th>
                <th scope="col" className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-ink-soft">Nenhuma empresa ainda.</td>
                </tr>
              ) : null}
              {companies.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={`/admin/empresas/${c.id}`} className="font-bold text-navy underline underline-offset-4">
                      {c.name}
                    </Link>
                    {c.isDemo ? <span className="ml-2 rounded bg-amber-100 px-2 text-sm font-bold">DEMO</span> : null}
                  </td>
                  <td className="px-4 py-3">{c._count.members}</td>
                  <td className="px-4 py-3">{c._count.apiKeys}</td>
                  <td className="px-4 py-3">{c.status === "ATIVA" ? "Ativa" : "Suspensa"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-display text-xl font-extrabold text-navy">Nova empresa</h2>
          <CreateCompanyForm />
        </Card>
      </div>
    </>
  );
}
