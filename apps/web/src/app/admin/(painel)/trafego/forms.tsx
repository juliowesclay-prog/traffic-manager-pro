"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Link2, RefreshCw, Sparkles, Unplug } from "lucide-react";
import { Button, Checkbox } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import type { TrafficResult } from "@/server/traffic/connection";
import {
  analyzeAction,
  connectMetaAction,
  disconnectMetaAction,
  refreshAccountsAction,
  selectAccountAction,
  syncIntervalAction,
  syncNowAction,
  type ConnectStart,
} from "./actions";

export function ConnectMetaButton({ label }: { label: string }) {
  const [result, onSubmit, pending] = useServerForm<ConnectStart>(connectMetaAction);
  // Vai para a tela de autorização da Meta (ou a simulada, em testes).
  useEffect(() => {
    if (result?.ok && result.next) window.location.assign(result.next);
  }, [result]);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      {result && !result.ok ? <ResultMessage result={result} /> : null}
      <Button
        type="submit"
        variant="primary"
        disabled={pending || !!result?.next}
        icon={<Link2 className="size-5" />}
        className="justify-self-start"
      >
        {pending || result?.next ? "Abrindo a Meta…" : label}
      </Button>
    </form>
  );
}

export function SelectAccountButton({ id, name }: { id: string; name: string }) {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(selectAccountAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" disabled={pending} aria-label={`Usar a conta ${name}`}>
        Usar esta conta
      </Button>
      {result && !result.ok ? <ResultMessage result={result} /> : null}
    </form>
  );
}

export function RefreshAccountsButton() {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(refreshAccountsAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<RefreshCw className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Atualizando…" : "Atualizar lista de contas"}
      </Button>
    </form>
  );
}

export function DisconnectMetaForm() {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(disconnectMetaAction);
  if (result?.ok) return <ResultMessage result={result} />;
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <Checkbox
        name="confirmo"
        label="Confirmo: desconectar apaga a chave de acesso e o Traffic Manager Pro deixa de ler e gerenciar os anúncios."
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<Unplug className="size-5" />}
        className="justify-self-start"
      >
        Desconectar da Meta
      </Button>
    </form>
  );
}

export function SyncNowButton() {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(syncNowAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        icon={<RefreshCw className="size-5" />}
        className="justify-self-start"
      >
        {pending ? "Atualizando…" : "Atualizar agora"}
      </Button>
    </form>
  );
}

export function SyncIntervalForm({
  current,
  options,
}: {
  current: number;
  options: { value: number; label: string }[];
}) {
  const [result, onSubmit, pending] = useServerForm<TrafficResult>(syncIntervalAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <ResultMessage result={result} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor="intervalo-sync" className="text-sm font-bold text-navy">
            Atualização automática
          </label>
          <select
            id="intervalo-sync"
            name="intervalo"
            defaultValue={current}
            className="min-h-12 rounded-xl border-2 border-line bg-white px-3 text-base text-ink"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

export function AnalyzeForm({
  periods,
  defaultPeriod,
}: {
  periods: readonly number[];
  defaultPeriod: number;
}) {
  const [result, onSubmit, pending] = useServerForm<ConnectStart>(analyzeAction);
  const router = useRouter();
  useEffect(() => {
    if (result?.ok && result.next) router.push(result.next);
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-busy={pending}>
      {result && !result.ok ? <ResultMessage result={result} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor="periodo-ia" className="text-sm font-bold text-navy">
            Período analisado
          </label>
          <select
            id="periodo-ia"
            name="periodo"
            defaultValue={defaultPeriod}
            className="min-h-12 rounded-xl border-2 border-line bg-white px-3 text-base text-ink"
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                Últimos {p} dias
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={pending} icon={<Sparkles className="size-5" />}>
          {pending ? "Analisando… (pode levar até 1 minuto)" : "Pedir análise"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {pending ? "Analisando os anúncios, aguarde." : ""}
      </p>
    </form>
  );
}
