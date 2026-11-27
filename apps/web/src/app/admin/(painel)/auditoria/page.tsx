import type { Metadata } from "next";
import { Filter } from "lucide-react";
import { prisma } from "@tmp/db";
import { Button, Card, SelectField } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { AUDIT_LABELS, auditLabel } from "@/lib/audit-labels";
import { seesAllCompanies } from "@tmp/core";
import { requireStaff } from "@/server/auth";
import { companiesOf } from "@/server/company";

export const metadata: Metadata = { title: "Auditoria" };

const dt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ acao?: string }> }) {
  const { user, roles } = await requireStaff("audit:read");
  // Quem não é superadministrador só vê o que aconteceu nas empresas que pode abrir.
  const scope = seesAllCompanies(roles)
    ? {}
    : { companyId: { in: (await companiesOf(user)).map((c) => c.id) } };
  const acao = (await searchParams).acao;
  const filter = acao && acao in AUDIT_LABELS ? acao : undefined;
  const logs = await prisma.auditLog.findMany({
    where: { ...scope, ...(filter ? { action: filter } : {}) },
    orderBy: { at: "desc" },
    take: 100,
  });
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, roles: true },
  });
  const actorName = (id: string | null) => {
    const a = actors.find((x) => x.id === id);
    if (!a) return "Sistema";
    return a.name;
  };

  return (
    <>
      <AdminPageTitle
        title="Auditoria"
        subtitle="Últimas 100 ações registradas. O registro não pode ser alterado nem apagado."
      />
      <form className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField label="Tipo de ação" name="acao" defaultValue={filter ?? ""} className="flex-1">
          <option value="">Todas</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="primary" icon={<Filter className="size-5" />}>
          Filtrar
        </Button>
      </form>
      <Card className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Tabela de auditoria">
        <table className="w-full min-w-[44rem] text-left text-base">
          <caption className="sr-only">Registros de auditoria</caption>
          <thead className="bg-navy-50 text-sm text-navy">
            <tr>
              <th scope="col" className="px-4 py-3">
                Quando
              </th>
              <th scope="col" className="px-4 py-3">
                Ação
              </th>
              <th scope="col" className="px-4 py-3">
                Quem
              </th>
              <th scope="col" className="px-4 py-3">
                IP
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{dt(l.at)}</td>
                <td className="px-4 py-3">{auditLabel(l.action)}</td>
                <td className="px-4 py-3">{actorName(l.actorId)}</td>
                <td className="px-4 py-3 font-mono text-sm">{l.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
