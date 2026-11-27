"use client";

import { useEffect, type RefObject } from "react";

/**
 * Em celulares lentos a pessoa pode digitar antes de a página terminar de carregar; quando o React
 * assume os campos controlados, o texto digitado seria apagado. Este hook recupera o que já está na tela
 * e marca o formulário como pronto (data-pronto="1").
 */
export function useRecoverTyped(
  formRef: RefObject<HTMLFormElement | null>,
  recover: (name: string, value: string) => void,
) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (
        el instanceof HTMLInputElement &&
        el.name &&
        el.type !== "hidden" &&
        el.type !== "checkbox" &&
        el.value
      ) {
        recover(el.name, el.value);
      }
    }
    form.dataset.pronto = "1";
    // Executa só uma vez, na montagem.
  }, []);
}
