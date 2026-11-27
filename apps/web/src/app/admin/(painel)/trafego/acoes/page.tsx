import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  can,
  centsToInput,
  describeTrafficAction,
  formatBRL,
  isTrafficActionKind,
  parseBRL,
  TRAFFIC_ACTION_LABELS,
  TRAFFIC_ACTION_STATUS_LABELS,
  TRAFFIC_LEVEL_LABELS,
  TRAFFIC_ACTION_KINDS,
} from "@prosed/core";
import { Card, cn } from "@prosed/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireStaff } from "@/server/auth";
import {
  actionOutcome,
  actionSettings,
  actionTargets,
  activeBudgetNow,
  listActions,
  previewAction,
  selectedAccount,
} from "@/server/traffic/meta-actions";
import { TrafficTabs } from "../tabs";
import { ActionSettingsForm, CancelForm, ConfirmActionForm, DecideForm } from "./forms";

export const metadata: Metadata = { title: "Ações nos anúncios" };

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const money = (c: number | null) => (c == null ? "—" : formatBRL(c));
const STATUS: Record<string, string> = { ACTIVE: "ativo", PAUSED: "pausado" };
const st = (s: string) => STATUS[s] ?? s.toLowerCase();
const selectCls = "min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg text-ink";

export default async function TrafficActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ alvo?: string; tipo?: string; valor?: string; analise?: string; acao?: string }>;
}) {
  const { user, roles } = await requireStaff("traffic:read");
  const canManage = can(roles, "traffic:manage");
  const canApprove = can(roles, "traffic:approve");
  const q = await searchParams;
  const { account } = await selectedAccount();

  if (!account)
    return (
      <>
        <AdminPageTitle
          title="Ações nos anúncios"
          subtitle="Pausar, reativar e mudar orçamento, com aprovação"
        />
        <TrafficTabs />
        <Card>
          <p className="text-lg">
            Conecte a Meta e escolha a conta de anúncios primeiro.{" "}
            <Link href="/admin/trafego" className="font-bold text-navy underline">
              Ir para Conexão
            </Link>
          </p>
        </Card>
      </>
    );

  const [settings, budget, targets, lists] = await Promise.all([
    actionSettings(),
    activeBudgetNow(account.accountId),
    actionTargets(account.accountId),
    listActions(account.accountId),
  ]);
  const alvo = /^\d{1,30}$/.test(q.alvo ?? "") ? q.alvo! : "";
  const tipo = isTrafficActionKind(q.tipo) ? q.tipo : "";
  const valor = (q.valor ?? "").slice(0, 20);
  const analise = /^[0-9a-f-]{36}$/i.test(q.analise ?? "") ? q.analise! : "";
  const preview =
    canManage && alvo && tipo ? await previewAction(alvo, tipo, valor ? parseBRL(valor) : null) : null;
  const outcome = /^[0-9a-f-]{36}$/i.test(q.acao ?? "")
    ? await actionOutcome(q.acao!, account.accountId)
    : null;
  const name = (id: string | null) => (id ? (lists.names.get(id) ?? "—") : "—");

  return (
    <>
      <AdminPageTitle
        title="Ações nos anúncios"
        subtitle="Pausar, reativar e mudar orçamento, com aprovação"
      />
      <TrafficTabs />

      {account.isDemo ? (
        <p
          role="note"
          className="mb-6 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 font-bold text-amber-950"
        >
          DEMO — Meta simulada. As ações mudam só os dados de teste.
        </p>
      ) : null}

      {outcome ? (
        <p
          id="resultado"
          role={outcome.ok ? "status" : "alert"}
          className={cn(
            "mb-6 rounded-2xl p-4 text-lg font-bold",
            outcome.ok ? "bg-saving-50 text-saving-dark" : "bg-red-50 text-red-dark",
          )}
        >
          {outcome.message}
        </p>
      ) : null}

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-navy" />
          <ul className="grid list-disc gap-1 pl-5 text-base">
            <li>
              <strong>Pausar</strong> e <strong>reduzir orçamento</strong> diminuem o gasto: são feitos na
              hora.
            </li>
            <li>
              <strong>Reativar</strong> e <strong>aumentar orçamento</strong> podem aumentar o gasto: viram
              pedido e só são feitos depois da aprovação de <strong>outra pessoa</strong>, dentro do teto.
            </li>
            <li>Tudo fica no histórico abaixo e na auditoria.</li>
          </ul>
        </div>
      </Card>

      <Card className="mt-6" data-testid="regras">
        <h2 className="text-xl font-bold text-navy">Teto e regras</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-soft">Ações na Meta</dt>
            <dd className="font-bold" data-testid="acoes-ligadas">
              {settings.enabled ? "Ligadas" : "Desligadas"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Teto do gasto diário</dt>
            <dd className="font-bold" data-testid="teto">
              {settings.dailyCapCents == null
                ? "Não definido (nada que aumente o gasto é aceito)"
                : formatBRL(settings.dailyCapCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Gasto diário ligado agora</dt>
            <dd className="font-bold" data-testid="gasto-ativo" data-valor={budget.total}>
              {formatBRL(budget.total)}
              <span className="block text-sm font-normal text-ink-soft">
                soma dos orçamentos diários ativos (dados da última atualização)
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Aumento máximo de orçamento por vez</dt>
            <dd className="font-bold">{settings.maxIncreasePct}%</dd>
          </div>
        </dl>
        {budget.lifetimeIds.length ? (
          <p className="mt-3 text-base text-ink-soft">
            {budget.lifetimeIds.length} item(ns) ativo(s) usam orçamento total (do período inteiro) e não
            entram na soma.
          </p>
        ) : null}
        {canApprove ? (
          <details className="mt-3">
            <summary className="min-h-12 cursor-pointer py-3 font-bold text-navy">
              Alterar teto e regras
            </summary>
            <ActionSettingsForm
              enabled={settings.enabled}
              cap={settings.dailyCapCents == null ? "" : centsToInput(settings.dailyCapCents)}
              maxIncreasePct={settings.maxIncreasePct}
            />
          </details>
        ) : (
          <p className="mt-3 text-base text-ink-soft">
            Só quem pode aprovar ações altera o teto e as regras.
          </p>
        )}
      </Card>

      {canManage ? (
        <Card className="mt-6">
          <h2 className="text-xl font-bold text-navy" id="nova-acao">
            Nova ação
          </h2>
          <form method="get" action="/admin/trafego/acoes#revisar" className="mt-3 grid gap-4 lg:grid-cols-3">
            <input type="hidden" name="analise" value={analise} />
            <div className="grid gap-2 lg:col-span-3">
              <label htmlFor="alvo" className="text-lg font-bold text-navy">
                Item
              </label>
              <select id="alvo" name="alvo" defaultValue={alvo} required className={selectCls}>
                <option value="">Escolha…</option>
                {(
                  [
                    ["Campanhas", targets.campaigns],
                    ["Conjuntos de anúncios", targets.adSets],
                    ["Anúncios", targets.ads],
                  ] as const
                ).map(([label, items]) =>
                  items.length ? (
                    <optgroup key={label} label={label}>
                      {items.map((i) => (
                        <option key={i.externalId} value={i.externalId}>
                          {i.name} ({st(i.status)}
                          {"dailyBudget" in i && i.dailyBudget ? `, ${formatBRL(i.dailyBudget)}/dia` : ""})
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="tipo" className="text-lg font-bold text-navy">
                Ação
              </label>
              <select id="tipo" name="tipo" defaultValue={tipo} required className={selectCls}>
                <option value="">Escolha…</option>
                {TRAFFIC_ACTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TRAFFIC_ACTION_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="valor" className="text-lg font-bold text-navy">
                Novo orçamento diário (R$)
              </label>
              <p id="valor-dica" className="text-base text-ink-soft">
                Só para “Mudar orçamento diário”.
              </p>
              <input
                id="valor"
                name="valor"
                inputMode="decimal"
                defaultValue={valor}
                placeholder="60,00"
                aria-describedby="valor-dica"
                className={selectCls}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex min-h-14 items-center rounded-xl border-2 border-navy px-6 text-lg font-bold text-navy"
              >
                Revisar
              </button>
            </div>
          </form>

          {preview ? (
            <section
              id="revisar"
              aria-labelledby="revisar-titulo"
              className="mt-6 border-t-2 border-line pt-4"
              data-testid="previa"
            >
              <h3 id="revisar-titulo" className="text-lg font-bold text-navy">
                Revisão
              </h3>
              {!preview.result.ok ? (
                <p role="alert" className="mt-2 rounded-2xl bg-red-50 p-4 font-bold text-red-dark">
                  {preview.result.message}
                </p>
              ) : (
                <>
                  <dl className="mt-2 grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-ink-soft">{TRAFFIC_LEVEL_LABELS[preview.target!.level]}</dt>
                      <dd className="font-bold break-words">{preview.target!.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-ink-soft">O que muda</dt>
                      <dd className="font-bold">
                        {preview.result.plan.kind === "ORCAMENTO"
                          ? `${describeTrafficAction(preview.result.plan)}${preview.result.plan.increasePct != null ? ` (+${preview.result.plan.increasePct.toLocaleString("pt-BR")}%)` : ""}`
                          : `${st(preview.result.plan.fromStatus)} → ${st(preview.result.plan.toStatus)}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-ink-soft">Gasto diário ligado</dt>
                      <dd className="font-bold" data-testid="previa-total">
                        {formatBRL(preview.result.plan.totalBefore)} →{" "}
                        {formatBRL(preview.result.plan.totalAfter)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-ink-soft">Teto</dt>
                      <dd className="font-bold">{money(preview.result.plan.capCents)}</dd>
                    </div>
                  </dl>
                  {preview.result.plan.increasesSpend ? (
                    <p
                      className="mt-3 flex items-start gap-2 rounded-2xl border-2 border-amber-500 bg-amber-50 p-3 font-bold text-amber-950"
                      data-testid="precisa-aprovacao"
                    >
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                      Pode aumentar o gasto: vira pedido e precisa da aprovação de outra pessoa.
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-ink-soft">
                    Ao confirmar, o item é lido de novo na Meta; se tiver mudado, os números são refeitos.
                  </p>
                  <ConfirmActionForm
                    key={`${alvo}-${tipo}-${valor}`}
                    alvo={alvo}
                    tipo={tipo}
                    valor={valor}
                    analise={analise}
                    needsApproval={preview.result.plan.increasesSpend}
                  />
                </>
              )}
            </section>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-6" data-testid="pendentes">
        <h2 className="text-xl font-bold text-navy">Aguardando aprovação ({lists.pending.length})</h2>
        {lists.pending.length ? (
          <ul className="mt-3 grid gap-4">
            {lists.pending.map((a) => {
              const mine = a.requestedById === user.id;
              return (
                <li
                  key={a.id}
                  className="rounded-2xl border-2 border-amber-500 p-4"
                  data-testid={`pedido-${a.id}`}
                >
                  <p className="text-lg font-bold break-words text-navy">
                    {describeTrafficAction(a)} — {a.objectName}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {TRAFFIC_LEVEL_LABELS[a.level]} · pedido por {name(a.requestedById)} em{" "}
                    {when(a.requestedAt)}
                    {a.expiresAt ? ` · vence em ${when(a.expiresAt)}` : ""}
                  </p>
                  <p className="mt-2 text-base">
                    Gasto diário ligado: {formatBRL(a.totalBefore)} →{" "}
                    <strong>{formatBRL(a.totalAfter)}</strong> (teto na hora do pedido: {money(a.capCents)})
                  </p>
                  <p className="mt-1 text-base break-words">
                    <span className="text-ink-soft">Motivo:</span> {a.reason}
                  </p>
                  {canApprove && !mine ? <DecideForm id={a.id} name={a.objectName} /> : null}
                  {mine && canApprove ? (
                    <p className="mt-2 text-base text-ink-soft">
                      Você fez este pedido: outra pessoa precisa aprovar.
                    </p>
                  ) : null}
                  {!canApprove && mine ? (
                    <p className="mt-2 text-base text-ink-soft">
                      Aguardando alguém com permissão de aprovar.
                    </p>
                  ) : null}
                  {canManage && (mine || canApprove) ? <CancelForm id={a.id} name={a.objectName} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Nenhum pedido aguardando.</p>
        )}
      </Card>

      <Card className="mt-6" data-testid="historico-acoes">
        <h2 className="text-xl font-bold text-navy">Histórico</h2>
        {lists.history.length ? (
          <ul className="mt-3 grid gap-3">
            {lists.history.map((a) => (
              <li key={a.id} className="border-b border-line pb-3" data-testid={`acao-${a.id}`}>
                <p className="font-bold break-words">
                  <span
                    className={cn(
                      "mr-2 inline-block rounded-full px-3 py-0.5 text-sm",
                      a.status === "EXECUTADA"
                        ? "bg-saving-50 text-saving-dark"
                        : a.status === "FALHOU"
                          ? "bg-red-50 text-red-dark"
                          : "bg-navy-50 text-navy",
                    )}
                  >
                    {TRAFFIC_ACTION_STATUS_LABELS[a.status]}
                  </span>
                  {describeTrafficAction(a)} — {a.objectName}
                </p>
                <p className="text-sm text-ink-soft">
                  Pedido por {name(a.requestedById)} em {when(a.requestedAt)}
                  {a.decidedById && a.decidedById !== a.requestedById
                    ? ` · ${a.status === "RECUSADA" ? "recusado" : a.status === "CANCELADA" ? "cancelado" : "aprovado"} por ${name(a.decidedById)}`
                    : ""}
                  {a.executedAt ? ` · feito em ${when(a.executedAt)}` : ""}
                  {a.isDemo ? " · DEMO" : ""}
                </p>
                <p className="text-sm break-words">
                  <span className="text-ink-soft">Motivo:</span> {a.reason}
                  {a.decisionNote ? (
                    <>
                      {" "}
                      · <span className="text-ink-soft">Observação:</span> {a.decisionNote}
                    </>
                  ) : null}
                </p>
                {a.error ? <p className="text-sm font-bold text-red-dark">{a.error}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Nenhuma ação ainda.</p>
        )}
      </Card>
    </>
  );
}
