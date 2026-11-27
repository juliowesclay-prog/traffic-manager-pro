"use client";

import { Save, Send } from "lucide-react";
import { Button, Checkbox, Field } from "@prosed/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import type { TrafficResult } from "@/server/traffic/connection";
import { saveCapiSettingsAction, sendConversionsAction } from "../actions";

export function CapiSettingsForm({
  enabled,
  datasetId,
  testEventCode,
}: {
  enabled: boolean;
  datasetId: string;
  testEventCode: string;
}) {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(saveCapiSettingsAction);
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-4">
      <ResultMessage result={result} />
      <Field
        name="dataset"
        label="ID do conjunto de dados (pixel)"
        hint="No Gerenciador de Eventos da Meta → Fontes de dados → o número abaixo do nome."
        inputMode="numeric"
        defaultValue={datasetId}
        placeholder="1234567890123456"
      />
      <Field
        name="teste"
        label="Código de teste"
        hint="Para conferir no Gerenciador de Eventos → Eventos de teste. Com ele, os eventos NÃO contam nos anúncios. Apague depois de conferir."
        defaultValue={testEventCode}
        placeholder="TEST12345"
      />
      <Checkbox name="ligada" defaultChecked={enabled} label="Enviar cadastros e vendas para a Meta" />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<Save className="size-5" />}
        className="justify-self-start"
      >
        Salvar
      </Button>
    </form>
  );
}

export function SendNowButton() {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(sendConversionsAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        icon={<Send className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Enviando…" : "Enviar agora"}
      </Button>
    </form>
  );
}
