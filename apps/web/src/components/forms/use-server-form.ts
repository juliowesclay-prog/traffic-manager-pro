"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Envia um formulário para uma ação de servidor SEM limpar os campos.
 * (Com `<form action>`, o React 19 reinicia o formulário após cada envio; se o servidor recusar
 * um campo, a pessoa perderia tudo o que digitou nos outros.)
 * Uso: const [result, onSubmit, pending] = useServerForm(minhaAcao); <form onSubmit={onSubmit}>
 */
export function useServerForm<S>(serverAction: (prev: S | undefined, form: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState<S | undefined, FormData>(serverAction, undefined);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
