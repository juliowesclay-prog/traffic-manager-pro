import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ROLE_LABELS } from "@tmp/core";
import { prisma } from "@tmp/db";
import { Card } from "@tmp/ui";
import { LinkButton } from "@/components/link-button";
import { AdminPageTitle } from "@/components/admin/page-title";
import { ASSIGNABLE_ROLES } from "@/server/admin-users";
import { requireStaff } from "@/server/auth";
import { ManageStaffForm, RolesForm } from "../forms";

export const metadata: Metadata = { title: "Usuário da equipe" };

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user: actor } = await requireStaff("users:manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
  if (!u || !u.roles.length) notFound();
  const self = actor.id === u.id;

  return (
    <>
      <LinkButton
        href="/admin/usuarios"
        variant="ghost"
        className="mb-4 px-0"
        icon={<ArrowLeft className="size-5" />}
      >
        Voltar para a equipe
      </LinkButton>
      <AdminPageTitle
        title={u.name}
        subtitle={`${u.email} · ${u.status === "BLOCKED" ? "Bloqueado" : "Ativo"}`}
      />
      {self ? (
        <p className="mb-6 rounded-2xl bg-navy-50 p-4 text-navy">
          Esta é a sua conta. Por segurança, perfis e bloqueio só podem ser alterados por outro
          superadministrador.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-base font-semibold text-ink">Perfis</h2>
          <div className="mt-4">
            <RolesForm
              userId={u.id}
              roles={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              selected={u.roles.map((r) => r.role)}
            />
          </div>
        </Card>
        <div className="grid gap-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Acesso</h2>
            <div className="mt-4 grid gap-6">
              <ManageStaffForm userId={u.id} op="reset-password" label="Gerar senha provisória" />
              {u.status === "BLOCKED" ? (
                <ManageStaffForm userId={u.id} op="unblock" label="Desbloquear usuário" variant="primary" />
              ) : (
                <ManageStaffForm userId={u.id} op="block" label="Bloquear usuário" variant="cta" />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
