"use client";

import { KeyRound, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Field } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import type { CompanyResult } from "@/server/company";
import { createCompanyAction, manageCompanyAction } from "./actions";

function Result({ result }: { result?: CompanyResult }) {
  if (!result) return null;
  return (
    <div className="grid gap-3">
      <ResultMessage result={result} />
      {result.ok && result.secret ? (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
          <p className="flex items-center gap-2 font-bold">
            <KeyRound aria-hidden="true" className="size-5" /> Chave da API (copie agora — não será mostrada de novo):
          </p>
          <p className="mt-2 select-all break-all font-mono text-base font-bold" data-testid="chave-api">
            {result.secret}
          </p>
          <p className="mt-2 text-sm">Guarde no cofre do sistema que vai enviar as vendas. Nunca mande por e-mail ou chat.</p>
        </div>
      ) : null}
    </div>
  );
}

export function CreateCompanyForm() {
  const [result, action, pending] = useServerForm<CompanyResult>(createCompanyAction);
  return (
    <form onSubmit={action} className="grid gap-5">
      <Result result={result} />
      <Field label="Nome da empresa" name="name" required autoComplete="off" />
      <Button type="submit" variant="primary" disabled={pending} icon={<Plus className="size-5" />} className="justify-self-start">
        {pending ? "Criando…" : "Cadastrar empresa"}
      </Button>
    </form>
  );
}

/** Um formulário por operação (cada botão faz uma coisa só). */
export function ManageCompanyForm({
  companyId,
  op,
  label,
  children,
  variant = "secondary",
  hidden,
}: {
  companyId: string;
  op: string;
  label: string;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "cta";
  hidden?: Record<string, string>;
}) {
  const [result, action, pending] = useServerForm<CompanyResult>(manageCompanyAction);
  return (
    <form onSubmit={action} className="grid gap-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="op" value={op} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Result result={result} />
      <Button type="submit" variant={variant} disabled={pending} className="justify-self-start">
        {pending ? "Aguarde…" : label}
      </Button>
    </form>
  );
}

export function GrantAccessForm({ companyId }: { companyId: string }) {
  return (
    <ManageCompanyForm companyId={companyId} op="grant" label="Liberar acesso" variant="primary">
      <Field label="E-mail do usuário" name="email" type="email" required autoComplete="off" />
    </ManageCompanyForm>
  );
}

export function CreateKeyForm({ companyId }: { companyId: string }) {
  return (
    <ManageCompanyForm companyId={companyId} op="key-create" label="Gerar chave" variant="primary">
      <Field label="Nome da integração (ex.: Site, Loja, CRM)" name="name" required autoComplete="off" />
    </ManageCompanyForm>
  );
}
