"use client";

import { Ban, CheckCircle2, Save, Send, X, Zap } from "lucide-react";
import { Button, Checkbox, Field, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import type { TrafficResult } from "@/server/traffic/connection";
import type { ActionResult } from "@/server/traffic/meta-actions";
import {
  cancelTrafficAction,
  decideTrafficAction,
  requestTrafficAction,
  saveActionSettingsAction,
} from "../actions";

/** Confirmação da ação revisada: motivo obrigatório e caixa de confirmação. */
export function ConfirmActionForm({
  alvo,
  tipo,
  valor,
  analise,
  needsApproval,
}: {
  alvo: string;
  tipo: string;
  valor: string;
  analise: string;
  needsApproval: boolean;
}) {
  const [result, onSubmit, pending] = useServerForm<ActionResult>(requestTrafficAction);
  if (result?.ok) return <ResultMessage result={result} />;
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4" aria-busy={pending}>
      <ResultMessage result={result} />
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="valor" value={valor} />
      <input type="hidden" name="analise" value={analise} />
      <TextAreaField
        name="motivo"
        label="Motivo"
        hint="Por que fazer isto? Fica no histórico e na auditoria."
        required
        minLength={10}
        maxLength={500}
      />
      <Checkbox
        name="confirmo"
        label={
          needsApproval
            ? "Confirmo o pedido. Ele só será feito na Meta depois da aprovação de outra pessoa."
            : "Confirmo: fazer esta mudança agora na Meta."
        }
      />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        icon={needsApproval ? <Send className="size-5" /> : <Zap className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Enviando…" : needsApproval ? "Enviar para aprovação" : "Fazer agora na Meta"}
      </Button>
    </form>
  );
}

/** Aprovar (executa na hora) ou recusar um pedido. */
export function DecideForm({ id, name }: { id: string; name: string }) {
  const [result, onSubmit, pending] = useServerForm<ActionResult>(decideTrafficAction);
  if (result?.ok) return <ResultMessage result={result} />;
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3" aria-busy={pending}>
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Field name="observacao" label="Observação" maxLength={300} />
      <Checkbox
        name="confirmo"
        label="Confirmo a aprovação: a mudança será feita agora na Meta e pode aumentar o gasto."
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="decisao"
          value="aprovar"
          variant="primary"
          disabled={pending}
          icon={<CheckCircle2 className="size-5" />}
          aria-label={`Aprovar e fazer: ${name}`}
        >
          {pending ? "Enviando…" : "Aprovar e fazer"}
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="recusar"
          variant="secondary"
          disabled={pending}
          icon={<Ban className="size-5" />}
          aria-label={`Recusar: ${name}`}
        >
          Recusar
        </Button>
      </div>
    </form>
  );
}

export function CancelForm({ id, name }: { id: string; name: string }) {
  const [result, onSubmit, pending] = useServerForm<ActionResult>(cancelTrafficAction);
  if (result?.ok) return <ResultMessage result={result} />;
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-2">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<X className="size-5" />}
        className="justify-self-start"
        aria-label={`Cancelar pedido: ${name}`}
      >
        Cancelar pedido
      </Button>
    </form>
  );
}

export function ActionSettingsForm({
  enabled,
  cap,
  maxIncreasePct,
}: {
  enabled: boolean;
  cap: string;
  maxIncreasePct: number;
}) {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(saveActionSettingsAction);
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-4">
      <ResultMessage result={result} />
      <Checkbox
        name="ligadas"
        defaultChecked={enabled}
        label="Ações na Meta ligadas (desmarque para bloquear todas as mudanças na hora)"
      />
      <Field
        name="teto"
        label="Teto do gasto diário (R$)"
        hint="Soma máxima dos orçamentos diários ligados. Em branco: nada que aumente o gasto é aceito."
        inputMode="decimal"
        defaultValue={cap}
        placeholder="150,00"
      />
      <Field
        name="aumento"
        label="Aumento máximo de orçamento por vez (%)"
        type="number"
        min={1}
        max={100}
        required
        defaultValue={maxIncreasePct}
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<Save className="size-5" />}
        className="justify-self-start"
      >
        Salvar teto e regras
      </Button>
    </form>
  );
}
