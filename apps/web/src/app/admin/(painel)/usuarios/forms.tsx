"use client";

import { useServerForm } from "@/components/forms/use-server-form";
import { UserPlus } from "lucide-react";
import { type ReactNode } from "react";
import { Button, Checkbox, Field } from "@tmp/ui";
import { AdminResultMessage } from "@/components/admin/admin-result";
import type { AdminResult } from "@/server/admin-users";
import { createStaffAction, manageStaffAction } from "./actions";

export interface RoleOption {
  value: string;
  label: string;
}

function RoleChecks({ options, selected = [] }: { options: RoleOption[]; selected?: string[] }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-lg font-bold text-navy">Perfis de acesso</legend>
      {options.map((o) => (
        <Checkbox
          key={o.value}
          name="roles"
          value={o.value}
          defaultChecked={selected.includes(o.value)}
          label={o.label}
        />
      ))}
    </fieldset>
  );
}

export function CreateStaffForm({ roles }: { roles: RoleOption[] }) {
  const [result, action, pending] = useServerForm<AdminResult>(createStaffAction);
  return (
    <form onSubmit={action} className="grid gap-5">
      <AdminResultMessage result={result} />
      <Field label="Nome" name="name" required autoComplete="off" />
      <Field label="E-mail" name="email" type="email" required autoComplete="off" />
      <RoleChecks options={roles} />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        icon={<UserPlus className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Criando…" : "Criar usuário"}
      </Button>
    </form>
  );
}

/** Um formulário por ação (cada botão confirma uma operação específica). */
export function ManageStaffForm({
  userId,
  op,
  children,
  label,
  variant = "secondary",
}: {
  userId: string;
  op: string;
  children?: ReactNode;
  label: string;
  variant?: "primary" | "secondary" | "cta";
}) {
  const [result, action, pending] = useServerForm<AdminResult>(manageStaffAction);
  return (
    <form onSubmit={action} className="grid gap-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      {children}
      <AdminResultMessage result={result} />
      <Button type="submit" variant={variant} disabled={pending} className="justify-self-start">
        {pending ? "Aguarde…" : label}
      </Button>
    </form>
  );
}

export function RolesForm({
  userId,
  roles,
  selected,
}: {
  userId: string;
  roles: RoleOption[];
  selected: string[];
}) {
  return (
    <ManageStaffForm userId={userId} op="roles" label="Salvar perfis" variant="primary">
      <RoleChecks options={roles} selected={selected} />
    </ManageStaffForm>
  );
}
