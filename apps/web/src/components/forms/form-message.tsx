"use client";

import { useEffect, useRef } from "react";

/**
 * Mensagem geral de erro do formulário: recebe o foco e é anunciada pelo leitor de tela.
 * Erros de campo ficam junto de cada campo; aqui vai o resumo ou um erro geral.
 */
export function FormMessage({ message }: { message?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message) return;
    // Se há campo com erro, o foco vai para ele (focusFirstError); a mensagem é anunciada pelo role="alert".
    if (ref.current?.closest("form")?.querySelector("[aria-invalid='true']")) return;
    ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-2xl border-2 border-red/40 bg-red-50 p-4 text-lg font-bold text-red-dark"
    >
      <span aria-hidden="true">⚠ </span>
      {message}
    </div>
  );
}

/** Leva o foco ao primeiro campo com erro (WCAG 3.3.1). */
export function focusFirstError(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
}
