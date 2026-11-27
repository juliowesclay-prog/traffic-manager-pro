"use client";

import { Download, LogOut, Palette } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, SelectField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { connectCanvaAction, disconnectCanvaAction, importCanvaAction } from "./actions";

export function ConnectCanva() {
  const [result, onSubmit, pending] = useServerForm(connectCanvaAction);
  useEffect(() => {
    if (result?.ok && result.next) window.location.assign(result.next);
  }, [result]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      {result && !result.ok ? <ResultMessage result={result} /> : null}
      <Button type="submit" disabled={pending || !!result?.next} className="w-fit">
        <Palette aria-hidden="true" className="size-4" />
        {pending || result?.next ? "Abrindo o Canva…" : "Conectar minha conta do Canva"}
      </Button>
    </form>
  );
}

export function DisconnectCanva() {
  const [result, onSubmit, pending] = useServerForm(disconnectCanvaAction);
  return (
    <form onSubmit={onSubmit} className="inline">
      {result && !result.ok ? <span className="text-sm text-red-dark">{result.message} </span> : null}
      <Button type="submit" variant="ghost" disabled={pending}>
        <LogOut aria-hidden="true" className="size-4" />
        Desconectar
      </Button>
    </form>
  );
}

export function ImportDesign({
  id,
  title,
  formats,
}: {
  id: string;
  title: string;
  formats: Record<string, string>;
}) {
  const [result, onSubmit, pending] = useServerForm(importCanvaAction);
  if (result?.ok)
    return (
      <div className="grid gap-2">
        <ResultMessage result={result} />
        {result.id ? (
          <Link
            href={`/admin/marketing/biblioteca/${result.id}`}
            className="font-semibold text-accent-text underline"
          >
            Abrir na biblioteca
          </Link>
        ) : null}
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <input type="hidden" name="design" value={id} />
      <input type="hidden" name="titulo" value={title} />
      <SelectField label="Formato" name="formato" defaultValue="png">
        {Object.entries(formats).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </SelectField>
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        <Download aria-hidden="true" className="size-4" />
        {pending ? "Importando…" : "Importar para a biblioteca"}
      </Button>
    </form>
  );
}
