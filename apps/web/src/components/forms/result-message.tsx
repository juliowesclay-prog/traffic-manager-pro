"use client";

import { CircleCheck } from "lucide-react";
import { FormMessage } from "./form-message";

/** Mostra o resultado de uma ação: sucesso (anunciado) ou erro (recebe o foco). */
export function ResultMessage({ result }: { result?: { ok: boolean; message: string } }) {
  if (!result) return null;
  if (!result.ok) return <FormMessage message={result.message} />;
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-2xl bg-saving-50 p-4 text-lg font-bold text-saving-dark"
    >
      <CircleCheck aria-hidden="true" className="size-6" />
      {result.message}
    </p>
  );
}
