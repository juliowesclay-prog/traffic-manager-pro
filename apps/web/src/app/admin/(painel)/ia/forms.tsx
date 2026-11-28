"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { AI_KEY_PROVIDERS, type AiKeyProvider } from "@tmp/core/ai-credentials";
import { Button, Field, SelectField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { removeAiKeyAction, saveAiKeyAction } from "./actions";

export function AiKeyForm({
  current,
  models,
}: {
  current: { provider: AiKeyProvider; model: string } | null;
  models: string[];
}) {
  const [result, onSubmit, pending] = useServerForm(saveAiKeyAction);
  const [provider, setProvider] = useState<AiKeyProvider>(current?.provider ?? "claude");
  const p = AI_KEY_PROVIDERS[provider];
  const sameProvider = current?.provider === provider;
  return (
    <form onSubmit={onSubmit} className="grid gap-5" data-testid="form-chave-ia">
      <ResultMessage result={result} />
      <SelectField
        label="Qual inteligência artificial sua empresa usa"
        name="provedor"
        value={provider}
        onChange={(e) => setProvider(e.target.value as AiKeyProvider)}
      >
        {Object.entries(AI_KEY_PROVIDERS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </SelectField>

      <div className="rounded-xl border border-line bg-canvas p-4" data-testid="passo-a-passo">
        <p className="font-semibold text-ink">Como gerar a chave de API do {p.label}</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
          {p.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-2 text-sm">
          <a
            href={p.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent-text underline"
          >
            Abrir a página de chaves
          </a>
          {" · "}
          <a
            href={p.billingUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-accent-text underline"
          >
            Abrir a cobrança
          </a>
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          O login e a senha do ChatGPT ou do Claude não servem: a IA só funciona pela chave de API, e o custo
          é cobrado pelo próprio serviço na conta da sua empresa.
        </p>
      </div>

      <Field
        label="Chave de API"
        name="chave"
        type="password"
        autoComplete="off"
        spellCheck={false}
        required={!sameProvider}
        placeholder={sameProvider ? "Deixe em branco para manter a chave atual" : `${p.keyPrefix}...`}
      />
      {sameProvider && models.length ? (
        <SelectField label="Modelo" name="modelo" defaultValue={current?.model}>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="modelo" value="" />
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        <KeyRound aria-hidden="true" className="size-4" />
        {pending ? "Testando a chave…" : "Salvar e testar"}
      </Button>
    </form>
  );
}

export function RemoveAiKey() {
  const [result, onSubmit, pending] = useServerForm(removeAiKeyAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <Button type="submit" variant="ghost" disabled={pending} className="w-fit">
        <Trash2 aria-hidden="true" className="size-4" />
        Remover a chave
      </Button>
    </form>
  );
}
