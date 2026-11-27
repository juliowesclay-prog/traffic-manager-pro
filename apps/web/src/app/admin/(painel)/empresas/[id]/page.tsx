import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ROLE_LABELS, type Role } from "@tmp/core";
import { prisma } from "@tmp/db";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireStaff } from "@/server/auth";
import { CreateKeyForm, GrantAccessForm, ManageCompanyForm } from "../forms";

export const metadata: Metadata = { title: "Empresa" };

const when = (d: Date | null) =>
  d
    ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "—";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("companies:manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      members: { include: { user: { include: { roles: true } } }, orderBy: { createdAt: "asc" } },
      apiKeys: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!company) notFound();
  const keys = company.apiKeys;
  return (
    <>
      <AdminPageTitle
        title={company.name}
        subtitle={
          <>
            <Link href="/admin/empresas" className="underline underline-offset-4">
              Empresas
            </Link>{" "}
            · identificador <code>{company.slug}</code> · {company.status === "ATIVA" ? "ativa" : "suspensa"}
            {company.isDemo ? " · DEMO" : ""}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="grid gap-5 p-6">
          <h2 className="font-display text-base font-semibold text-ink">Quem pode abrir esta empresa</h2>
          <p className="text-ink-soft">Superadministradores abrem todas as empresas automaticamente.</p>
          <ul className="grid gap-3">
            {company.members.length === 0 ? (
              <li className="text-ink-soft">Ninguém além dos superadministradores.</li>
            ) : null}
            {company.members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
              >
                <span>
                  <span className="font-bold">{m.user.name}</span> · {m.user.email} ·{" "}
                  {m.user.roles.map((r) => ROLE_LABELS[r.role as Role]).join(", ")}
                </span>
                <ManageCompanyForm
                  companyId={company.id}
                  op="revoke"
                  label="Retirar acesso"
                  hidden={{ userId: m.userId }}
                />
              </li>
            ))}
          </ul>
          <GrantAccessForm companyId={company.id} />
        </Card>
        <Card className="grid gap-5 p-6">
          <h2 className="font-display text-base font-semibold text-ink">Chaves da API (fonte de vendas)</h2>
          <p className="text-ink-soft">
            Os sistemas da empresa (site, loja, CRM) usam a chave para enviar cadastros e vendas. Veja como em{" "}
            <Link href="/admin/fonte-de-vendas" className="underline underline-offset-4">
              Fonte de vendas
            </Link>
            .
          </p>
          <ul className="grid gap-3">
            {keys.length === 0 ? <li className="text-ink-soft">Nenhuma chave.</li> : null}
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
                data-testid={`chave-${k.prefix}`}
              >
                <span>
                  <span className="font-bold">{k.name}</span> · <code>{k.prefix}_…</code> · criada{" "}
                  {when(k.createdAt)} · último uso {when(k.lastUsedAt)}
                  {k.revokedAt ? (
                    <span className="ml-2 font-bold text-red">revogada {when(k.revokedAt)}</span>
                  ) : null}
                </span>
                {k.revokedAt ? null : (
                  <ManageCompanyForm
                    companyId={company.id}
                    op="key-revoke"
                    label="Revogar"
                    hidden={{ keyId: k.id }}
                  />
                )}
              </li>
            ))}
          </ul>
          <CreateKeyForm companyId={company.id} />
        </Card>
        <Card className="grid gap-4 p-6">
          <h2 className="font-display text-base font-semibold text-ink">Situação</h2>
          {company.status === "ATIVA" ? (
            <ManageCompanyForm companyId={company.id} op="suspend" label="Suspender empresa">
              <p className="text-ink-soft">
                Suspensa, ninguém abre a empresa, as rotinas automáticas param e as chaves da API deixam de
                funcionar. Os dados ficam guardados.
              </p>
            </ManageCompanyForm>
          ) : (
            <ManageCompanyForm
              companyId={company.id}
              op="reactivate"
              label="Reativar empresa"
              variant="primary"
            />
          )}
        </Card>
      </div>
    </>
  );
}
