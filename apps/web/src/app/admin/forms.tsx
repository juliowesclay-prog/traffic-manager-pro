"use client";

import { useServerForm } from "@/components/forms/use-server-form";
import { LogIn } from "lucide-react";
import { Button, Field } from "@tmp/ui";
import { FormMessage } from "@/components/forms/form-message";
import { staffLoginAction, type AdminFormState } from "./actions";

export function StaffLoginForm({
  area = "admin",
  testLogin = null,
}: {
  area?: "admin";
  /** Só em teste local (DEV_PREFILL_LOGIN). */
  testLogin?: { email: string; password: string } | null;
}) {
  const [state, action, pending] = useServerForm<AdminFormState>(staffLoginAction);
  return (
    <form onSubmit={action} className="grid gap-6">
      <FormMessage message={state?.message} />
      <input type="hidden" name="area" value={area} />
      {testLogin ? (
        <p
          role="status"
          data-testid="login-de-teste"
          className="rounded-xl border border-dashed border-amber-500 bg-amber-50 p-4 text-amber-950"
        >
          <strong>Ambiente de teste:</strong> o e-mail e a senha do administrador de demonstração já estão
          preenchidos. É só clicar em Continuar. Para outro perfil, troque o e-mail.
        </p>
      ) : null}
      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={testLogin?.email}
        required
      />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        defaultValue={testLogin?.password}
        required
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        icon={<LogIn className="size-6" />}
      >
        {pending ? "Aguarde…" : "Continuar"}
      </Button>
    </form>
  );
}
