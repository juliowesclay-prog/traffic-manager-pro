import type { Metadata } from "next";
import Link from "next/link";
import {
  can,
  costPer,
  formatBRL,
  intervalLabel,
  META_SITUATION_LABELS,
  META_SYNC_INTERVALS,
  objectiveLabel,
  ratio,
  REPORT_PERIODS,
  type MetaSituation,
} from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { campaignsReport, type Metrics } from "@/server/traffic/report";
import { Eye, MousePointerClick, ShoppingCart, Users, Wallet } from "lucide-react";
import { SyncIntervalForm, SyncNowButton } from "../forms";

export const metadata: Metadata = { title: "Campanhas" };

const when = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const int = (n: number) => n.toLocaleString("pt-BR");
const money = (c: number | null) => (c == null ? "—" : formatBRL(c));
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);

const TONE: Record<MetaSituation, string> = {
  ativa: "bg-saving-50 text-saving-dark",
  pausada: "bg-navy-50 text-navy",
  encerrada: "bg-line text-ink-soft",
  analise: "bg-amber-50 text-amber-950",
  problema: "bg-red-50 text-red-dark",
};
function Situation({ s }: { s: MetaSituation }) {
  return (
    <span className={cn("inline-block rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap", TONE[s])}>
      {META_SITUATION_LABELS[s]}
    </span>
  );
}

const SYNC_STATUS = {
  OK: "Concluída",
  PARCIAL: "Parcial",
  ERRO: "Falhou",
  EXECUTANDO: "Em andamento",
} as const;

/** Linha de números: gasto, impressões, cliques no link, CTR, custo por clique e resultados. */
function Numbers({ m }: { m: Metrics }) {
  const items: [string, string][] = [
    ["Gasto", formatBRL(m.spend)],
    ["Impressões", int(m.impressions)],
    ["Cliques no link", int(m.linkClicks)],
    ["CTR", pct(ratio(m.linkClicks, m.impressions))],
    ["Custo por clique", money(costPer(m.spend, m.linkClicks))],
    ["Cadastros (Meta)", int(m.leads)],
    ["Compras (Meta)", int(m.purchases)],
    ["Custo por compra", money(costPer(m.spend, m.purchases))],
  ];
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-base sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-ink-soft">{k}</dt>
          <dd className="font-bold whitespace-nowrap">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; situacao?: string }>;
}) {
  const { roles } = await requireCompanyStaff("traffic:read");
  const canManage = can(roles, "traffic:manage");
  const q = await searchParams;
  const days = (REPORT_PERIODS as readonly number[]).includes(Number(q.periodo)) ? Number(q.periodo) : 30;
  const filter =
    q.situacao === "ativa" || q.situacao === "pausada" || q.situacao === "encerrada" ? q.situacao : "";
  const r = await campaignsReport(days);

  return (
    <>
      <AdminPageTitle title="Campanhas" subtitle="Facebook e Instagram Ads da conta escolhida" />

      {!r.account ? (
        <Card>
          <p className="text-base">
            {r.connected ? "Escolha a conta de anúncios" : "Conecte a conta da Meta"} para ver as campanhas.{" "}
            <Link href="/admin/trafego" className="font-bold text-navy underline">
              Ir para Conexão
            </Link>
          </p>
        </Card>
      ) : (
        <>
          {r.account.isDemo ? (
            <p
              role="note"
              className="mb-6 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
            >
              DEMO — números simulados de teste. Não use para decisões.
            </p>
          ) : null}
          {r.connectionError ? (
            <p role="alert" className="mb-6 rounded-2xl bg-red-50 p-4 font-bold text-red-dark">
              {r.connectionError}
            </p>
          ) : null}

          <Card data-testid="atualizacao">
            <h2 className="font-display text-base font-semibold text-ink">{r.account.name}</h2>
            <p className="mt-1 text-base text-ink-soft" data-testid="ultima-atualizacao">
              {r.lastOk?.finishedAt
                ? `Última atualização completa: ${when(r.lastOk.finishedAt)}`
                : "Ainda não foi atualizada. A primeira busca traz os últimos 90 dias."}
            </p>
            {canManage ? (
              <div className="mt-3 flex flex-wrap items-end gap-6">
                <SyncNowButton />
                <SyncIntervalForm
                  current={r.interval}
                  options={META_SYNC_INTERVALS.map((v) => ({ value: v, label: intervalLabel(v) }))}
                />
              </div>
            ) : (
              <p className="mt-2 text-base">Atualização automática: {intervalLabel(r.interval)}.</p>
            )}
          </Card>

          <form
            method="get"
            action="/admin/trafego/campanhas"
            className="mt-6 flex flex-wrap items-end gap-3"
          >
            <div className="grid gap-1">
              <label htmlFor="periodo" className="text-sm font-bold text-navy">
                Período
              </label>
              <select
                id="periodo"
                name="periodo"
                defaultValue={days}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {REPORT_PERIODS.map((d) => (
                  <option key={d} value={d}>
                    Últimos {d} dias
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="situacao" className="text-sm font-bold text-navy">
                Situação
              </label>
              <select
                id="situacao"
                name="situacao"
                defaultValue={filter}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Todas</option>
                <option value="ativa">Ativas</option>
                <option value="pausada">Pausadas</option>
                <option value="encerrada">Encerradas</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-[10px] border border-slate-300 bg-white px-4 text-sm font-semibold text-ink hover:bg-navy-50"
            >
              Ver
            </button>
          </form>
          <p className="mt-2 text-sm text-ink-soft">
            {br(r.since)} a {br(r.until)} (fuso da conta). Compras e cadastros são os informados pela Meta; as
            vendas reais (fonte de vendas) estão na aba Vendas.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              testId="total-gasto"
              raw={r.totals.spend}
              icon={<Wallet className="size-6" />}
              label="Investido"
              value={formatBRL(r.totals.spend)}
            />
            <KpiCard
              testId="total-impressoes"
              raw={r.totals.impressions}
              icon={<Eye className="size-6" />}
              label="Impressões"
              value={int(r.totals.impressions)}
            />
            <KpiCard
              testId="total-cliques"
              raw={r.totals.linkClicks}
              icon={<MousePointerClick className="size-6" />}
              label="Cliques no link"
              value={int(r.totals.linkClicks)}
              note={`CTR ${pct(ratio(r.totals.linkClicks, r.totals.impressions))}`}
            />
            <KpiCard
              testId="total-cadastros"
              raw={r.totals.leads}
              icon={<Users className="size-6" />}
              label="Cadastros (Meta)"
              value={int(r.totals.leads)}
            />
            <KpiCard
              testId="total-compras"
              raw={r.totals.purchases}
              icon={<ShoppingCart className="size-6" />}
              label="Compras (Meta)"
              value={int(r.totals.purchases)}
              note={`custo por compra ${money(costPer(r.totals.spend, r.totals.purchases))}`}
            />
          </div>

          <h2 className="mt-8 font-display text-base font-semibold text-ink">Campanhas</h2>
          {r.tree.filter((c) => !filter || c.situation === filter).length ? (
            <ul className="mt-3 grid gap-4" data-testid="campanhas">
              {r.tree
                .filter((c) => !filter || c.situation === filter)
                .map((c) => (
                  <li key={c.externalId}>
                    <Card data-testid={`campanha-${c.externalId}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold break-words text-navy">{c.name}</h3>
                          <p className="text-sm text-ink-soft">
                            Objetivo: {objectiveLabel(c.objective)} ·{" "}
                            {c.dailyBudget
                              ? `orçamento diário ${formatBRL(c.dailyBudget)}`
                              : c.lifetimeBudget
                                ? `orçamento total ${formatBRL(c.lifetimeBudget)}`
                                : "orçamento nos conjuntos"}
                          </p>
                        </div>
                        <Situation s={c.situation} />
                      </div>
                      <Numbers m={c.metrics} />
                      {canManage && c.situation !== "encerrada" ? (
                        <Link
                          href={`/admin/trafego/acoes?alvo=${c.externalId}#nova-acao`}
                          className="mt-2 inline-flex min-h-12 items-center font-bold text-navy underline"
                          aria-label={`Pausar, reativar ou mudar orçamento: ${c.name}`}
                        >
                          Pausar, reativar ou mudar orçamento
                        </Link>
                      ) : null}
                      {c.adSets.length ? (
                        <details className="mt-3">
                          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">
                            Conjuntos e anúncios ({c.adSets.length})
                          </summary>
                          <ul className="grid gap-4 border-l-4 border-line pl-4">
                            {c.adSets.map((s) => (
                              <li key={s.externalId} data-testid={`conjunto-${s.externalId}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-bold">
                                    {s.name}
                                    {s.targeting ? (
                                      <span className="block text-sm font-normal text-ink-soft">
                                        {s.targeting}
                                      </span>
                                    ) : null}
                                  </p>
                                  <Situation s={s.situation} />
                                </div>
                                <Numbers m={s.metrics} />
                                <ul className="mt-3 grid gap-3 border-l-4 border-line pl-4">
                                  {s.ads.map((a) => (
                                    <li key={a.externalId} data-testid={`anuncio-${a.externalId}`}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-bold">
                                          {a.name}
                                          {a.title ? (
                                            <span className="block text-sm font-normal text-ink-soft">
                                              “{a.title}”{a.body ? ` — ${a.body.slice(0, 160)}` : ""}
                                            </span>
                                          ) : null}
                                        </p>
                                        <Situation s={a.situation} />
                                      </div>
                                      <Numbers m={a.metrics} />
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </Card>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-soft">
              {r.tree.length
                ? "Nenhuma campanha com essa situação."
                : "Nenhuma campanha ainda. Clique em Atualizar agora."}
            </p>
          )}

          <Card className="mt-6">
            <h2 className="font-display text-base font-semibold text-ink">Últimas atualizações</h2>
            {r.runs.length ? (
              <ul className="mt-3 grid gap-2" data-testid="execucoes">
                {r.runs.map((x) => (
                  <li key={x.id} className="border-b border-line pb-2">
                    <strong>{SYNC_STATUS[x.status]}</strong> · {when(x.startedAt)} ·{" "}
                    {x.trigger === "MANUAL" ? "manual" : "automática"}
                    {x.error ? <span className="block text-sm text-red-dark">{x.error}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-ink-soft">Nenhuma ainda.</p>
            )}
          </Card>
        </>
      )}
    </>
  );
}
