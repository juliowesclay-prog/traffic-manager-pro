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

      <div className="grid gap-3" data-testid="passo-a-passo">
        <p className="font-semibold text-ink">Passo a passo para gerar a chave do {p.label}</p>
        <ol className="grid gap-3">
          {p.guide.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-xl border border-line bg-canvas p-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-white"
              >
                {i + 1}
              </span>
              <div className="grid gap-1">
                <p className="font-semibold text-ink">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {step.title}
                </p>
                <p className="text-sm text-ink-soft">{step.detail}</p>
                {"link" in step && step.link ? (
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit text-sm font-semibold text-accent-text underline"
                  >
                    {step.link.label} ↗
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-soft">
          Login e senha do ChatGPT ou do Claude não servem: a conexão é feita só pela chave de API. O uso é
          cobrado pela {p.company} direto no cartão da sua empresa, conforme o quanto vocês usarem.
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
