"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, cn } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { uploadMarketingFile } from "./upload-client";

type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };

interface FileState {
  name: string;
  pct: number;
  stage: "aguardando" | "enviando" | "conferindo" | "pronto" | "erro";
  message?: string;
}

const STAGE_LABEL: Record<FileState["stage"], string> = {
  aguardando: "Aguardando",
  enviando: "Enviando",
  conferindo: "Conferindo o arquivo",
  pronto: "Pronto",
  erro: "Recusado",
};

/**
 * Formulário com envio de arquivos: primeiro envia e confere cada arquivo (com progresso), depois
 * chama a ação do servidor com os códigos dos arquivos prontos. Se um arquivo for recusado, nada é criado.
 */
export function UploadForm({
  action,
  purpose,
  accept,
  multiple,
  fileLabel,
  fileHint,
  submitLabel,
  redirectBase,
  children,
}: {
  action: (prev: Result | undefined, f: FormData) => Promise<Result>;
  purpose: "criativo" | "logo";
  accept: string;
  multiple?: boolean;
  fileLabel: string;
  fileHint?: ReactNode;
  submitLabel: string;
  /** Depois de criar, abre esta página + o id devolvido (ex.: "/admin/marketing/biblioteca/"). */
  redirectBase?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [result, dispatch, pending] = useActionState<Result | undefined, FormData>(action, undefined);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!result?.ok) return;
    if (redirectBase) router.push(`${redirectBase}${result.id ?? ""}`);
    else setFiles([]);
  }, [result, redirectBase, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("arquivos") as HTMLInputElement;
    const chosen = [...(input.files ?? [])];
    setLocalError(null);
    if (!chosen.length) return setLocalError("Escolha ao menos um arquivo.");
    setBusy(true);
    setFiles(chosen.map((f) => ({ name: f.name, pct: 0, stage: "aguardando" })));
    const ids: string[] = [];
    let failed = false;
    for (const [i, file] of chosen.entries()) {
      const r = await uploadMarketingFile(file, purpose, (pct, stage) =>
        setFiles((prev) => prev.map((p, j) => (j === i ? { ...p, pct, stage } : p))),
      );
      setFiles((prev) =>
        prev.map((p, j) => (j === i ? { ...p, stage: r.ok ? "pronto" : "erro", message: r.ok ? undefined : r.message } : p)),
      );
      if (r.ok) ids.push(r.id);
      else failed = true;
    }
    setBusy(false);
    if (failed) return setLocalError("Algum arquivo foi recusado. Corrija e envie de novo.");
    const data = new FormData(form);
    data.delete("arquivos");
    input.value = "";
    for (const id of ids) data.append("arquivo", id);
    startTransition(() => dispatch(data));
  }

  const working = busy || pending;
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <ResultMessage result={localError ? { ok: false, message: localError } : result} />
      {children}
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`arquivos-${purpose}`} className="text-sm font-semibold text-ink">
          {fileLabel}
        </label>
        {fileHint ? (
          <p id={`arquivos-${purpose}-dica`} className="text-sm text-ink-soft">
            {fileHint}
          </p>
        ) : null}
        <input
          id={`arquivos-${purpose}`}
          name="arquivos"
          type="file"
          accept={accept}
          multiple={multiple}
          aria-describedby={fileHint ? `arquivos-${purpose}-dica` : undefined}
          className="min-h-11 w-full rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-50 file:px-3 file:py-2 file:font-semibold file:text-accent-dark"
        />
      </div>
      {files.length ? (
        <ul className="grid gap-2" aria-live="polite" data-testid="envios">
          {files.map((f, i) => (
            <li key={i} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{f.name}</span>
                <span className={cn("shrink-0 font-semibold", f.stage === "erro" ? "text-red-dark" : "text-ink-soft")}>
                  {STAGE_LABEL[f.stage]}
                  {f.stage === "enviando" ? ` ${f.pct}%` : ""}
                </span>
              </div>
              {f.stage === "enviando" || f.stage === "conferindo" ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div className="h-full bg-accent transition-all" style={{ width: `${f.pct}%` }} />
                </div>
              ) : null}
              {f.message ? <p className="mt-1 font-semibold text-red-dark">{f.message}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button type="submit" disabled={working} icon={<Upload className="size-4" />}>
          {working ? "Enviando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
