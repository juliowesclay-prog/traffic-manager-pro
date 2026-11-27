"use client";

import { Check, Copy, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { STUDIO_GOALS, STUDIO_LIMITS, STUDIO_TONES } from "@tmp/core/marketing-ai";
import { Button, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { refineAction, studioAction } from "../studio-actions";

export function StudioForm({
  brands,
  defaultBrand,
}: {
  brands: { id: string; name: string }[];
  defaultBrand: string | null;
}) {
  const [result, onSubmit, pending] = useServerForm(studioAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <ResultMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Marca"
          name="marca"
          defaultValue={defaultBrand ?? ""}
          hint="A IA usa só as informações aprovadas desta marca."
        >
          <option value="">Sem marca</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Objetivo" name="objetivo" defaultValue="vendas">
          {Object.entries(STUDIO_GOALS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <SelectField label="Tom" name="tom" defaultValue="acolhedor">
          {Object.entries(STUDIO_TONES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <Field
          label="Público"
          name="publico"
          maxLength={STUDIO_LIMITS.audience}
          placeholder="Ex.: trabalhadores de Londrina, 25 a 55 anos"
        />
      </div>
      <Field
        label="Assunto do anúncio"
        name="assunto"
        required
        maxLength={STUDIO_LIMITS.topic}
        placeholder="Ex.: Cartão do Trabalhador"
      />
      <TextAreaField
        label="Pedido livre"
        name="pedido"
        maxLength={STUDIO_LIMITS.request}
        rows={3}
        placeholder="Ex.: quero 3 variações para Stories, destacando o atendimento rápido"
      />
      <Button type="submit" disabled={pending} className="w-fit">
        <Sparkles aria-hidden="true" className="size-4" />
        {pending ? "A IA está escrevendo…" : "Criar conteúdos"}
      </Button>
    </form>
  );
}

export function RefineForm({ id }: { id: string }) {
  const [result, onSubmit, pending] = useServerForm(refineAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Field
        label="Pedir ajuste"
        name="ajuste"
        required
        minLength={3}
        maxLength={STUDIO_LIMITS.refine}
        placeholder="Ex.: deixe os textos mais curtos e informais"
      />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        <Wand2 aria-hidden="true" className="size-4" />
        {pending ? "Ajustando…" : "Ajustar"}
      </Button>
    </form>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* navegador sem permissão de cópia */
        }
      }}
      aria-label={`${label}: ${text.slice(0, 40)}`}
    >
      {done ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {done ? "Copiado" : label}
    </Button>
  );
}
