"use client";

import { useServerForm } from "@/components/forms/use-server-form";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button, Field } from "@tmp/ui";
import { FormMessage } from "@/components/forms/form-message";
import { enrollMfaAction, staffLoginAction, verifyMfaAction, type AdminFormState } from "./actions";

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
          className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-amber-950"
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

export function TotpForm({ mode, testCode }: { mode: "enroll" | "verify"; testCode?: string | null }) {
  const [state, action, pending] = useServerForm<AdminFormState>(
    mode === "enroll" ? enrollMfaAction : verifyMfaAction,
  );
  return (
    <form onSubmit={action} className="grid gap-6">
      <FormMessage message={state?.message} />
      {testCode ? (
        <p
          role="status"
          className="rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-amber-950"
        >
          <strong>Ambiente de teste:</strong> o código do usuário de demonstração já está preenchido. É só
          clicar no botão. Se aparecer &quot;código inválido&quot;, recarregue a página.
        </p>
      ) : null}
      <Field
        label="Código de 6 números do aplicativo autenticador"
        defaultValue={testCode ?? undefined}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        className="max-w-sm"
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        icon={<ShieldCheck className="size-6" />}
      >
        {pending ? "Conferindo…" : mode === "enroll" ? "Ativar e entrar" : "Entrar no painel"}
      </Button>
    </form>
  );
}
