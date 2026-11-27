"use client";

import { useServerForm } from "@/components/forms/use-server-form";
import { Save } from "lucide-react";
import { Button, Field } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import type { AccountResult } from "@/server/account";
import { staffPasswordAction } from "./actions";

export function StaffPasswordForm({ forced }: { forced: boolean }) {
  const [result, action, pending] = useServerForm<AccountResult>(staffPasswordAction);
  const err = (f: string) => (result && !result.ok && result.field === f ? result.message : undefined);
  return (
    <form onSubmit={action} className="grid max-w-lg gap-5">
      <ResultMessage result={result} />
      <Field
        label={forced ? "Senha provisória" : "Senha atual"}
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={err("current")}
      />
      <Field
        label="Nova senha"
        name="next"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo de 12 caracteres. Dica: use uma frase."
        error={err("next")}
      />
      <Field
        label="Repita a nova senha"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={err("confirm")}
      />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        icon={<Save className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
