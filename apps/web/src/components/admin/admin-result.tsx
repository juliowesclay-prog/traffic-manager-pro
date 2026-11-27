"use client";

import { KeyRound } from "lucide-react";
import { ResultMessage } from "@/components/forms/result-message";

/** Resultado de ação administrativa; se houver senha provisória, mostra uma única vez. */
export function AdminResultMessage({
  result,
}: {
  result?: { ok: boolean; message: string; tempPassword?: string };
}) {
  if (!result) return null;
  return (
    <div className="grid gap-3">
      <ResultMessage result={result} />
      {result.ok && result.tempPassword ? (
        <div className="rounded-xl border border-amber-400/70 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-bold">
            <KeyRound aria-hidden="true" className="size-5" /> Senha provisória (anote agora — não será
            mostrada de novo):
          </p>
          <p
            className="mt-2 select-all font-mono text-xl font-bold tracking-wider"
            data-testid="senha-provisoria"
          >
            {result.tempPassword}
          </p>
          <p className="mt-2 text-sm">
            Entregue por um canal seguro. No primeiro acesso a pessoa troca a senha.
          </p>
        </div>
      ) : null}
    </div>
  );
}
