import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ImageOff,
  Info,
  MousePointerClick,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { costPer, formatBRL, periodChange, ratio, type AlertLevel } from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { DailyChart } from "@/components/admin/daily-chart";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { trafficDashboard } from "@/server/traffic/dashboard";

export const metadata: Metadata = { title: "Painel do tráfego" };

const PERIODS = [7, 14, 30] as const;
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const money = (c: number | null) => (c == null ? "—" : formatBRL(c));
const int = (n: number) => n.toLocaleString("pt-BR");

/** "▲ 12% vs período anterior". `goodWhenUp` define a cor (custo subir é ruim). */
function Change({
  cur,
  prev,
  goodWhenUp = true,
}: {
  cur: number | null;
  prev: number | null;
  goodWhenUp?: boolean;
}) {
  if (cur == null || prev == null) return <>sem comparação</>;
  const p = periodChange(cur, prev);
  if (p == null) return <>sem comparação</>;
  const up = p > 0;
  const good = p === 0 ? null : up === goodWhenUp;
  return (
    <span className={cn(good === true && "text-saving-dark", good === false && "text-red-dark", "font-bold")}>
      {p === 0 ? "=" : up ? "▲" : "▼"} {Math.abs(p).toLocaleString("pt-BR")}%{" "}
      <span className="font-normal text-ink-soft">vs período anterior</span>
    </span>
  );
}

const ALERT_STYLE: Record<AlertLevel, { cls: string; icon: React.ReactNode; label: string }> = {
  alta: {
    cls: "border-red/50 bg-red-50 text-red-dark",
    icon: <AlertOctagon aria-hidden="true" className="size-5 shrink-0" />,
    label: "Atenção",
  },
  media: {
    cls: "border-amber-500 bg-amber-50 text-amber-950",
    icon: <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />,
    label: "Avaliar",
  },
  info: {
    cls: "border-line bg-navy-50 text-navy",
    icon: <Info aria-hidden="true" className="size-5 shrink-0" />,
    label: "Dica",
  },
};

export default async function TrafficDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireCompanyStaff("traffic:read");
  const q = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(q.periodo)) ? Number(q.periodo) : 7;
  const d = await trafficDashboard(days);

  if (!d.account)
    return (
      <>
        <AdminPageTitle title="Painel do tráfego" subtitle="Investimento, vendas e alertas dos anúncios" />
        <Card>
          <p className="text-base">
            Conecte a Meta e escolha a conta de anúncios para ver o painel.{" "}
            <Link href="/admin/trafego" className="font-bold text-navy underline">
              Ir para Conexão
            </Link>
          </p>
        </Card>
      </>
    );

  const c = d.current;
  const p = d.previous;
  const cac = (x: { spend: number; sales: number }) => costPer(x.spend, x.sales);
  const roas = (x: { spend: number; revenue: number }) => (x.spend > 0 ? x.revenue / x.spend : null);

  return (
    <>
      <AdminPageTitle title="Painel do tráfego" subtitle="Investimento, vendas e alertas dos anúncios" />
      {d.account.isDemo ? (
        <p
          role="note"
          className="mb-6 rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
        >
          DEMO — números simulados de teste. Não use para decisões.
        </p>
      ) : null}

      <nav aria-label="Período do painel" className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-[10px] border border-line bg-white p-1">
          {PERIODS.map((n) => (
            <Link
              key={n}
              href={`/admin/trafego/painel?periodo=${n}`}
              aria-current={n === days ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-[7px] px-3 text-sm font-semibold",
                n === days ? "bg-navy text-white" : "text-ink-soft hover:bg-navy-50 hover:text-ink",
              )}
            >
              Últimos {n} dias
            </Link>
          ))}
        </div>
        <span className="text-xs text-ink-soft">
          {br(d.since)} a {br(d.until)}
          {d.lastSync
            ? ` · atualizado ${d.lastSync.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
            : ""}
        </span>
      </nav>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          testId="painel-investido"
          raw={c.spend}
          icon={<Wallet className="size-6" />}
          label="Investido"
          value={money(c.spend)}
          note={<Change cur={c.spend} prev={p.spend} goodWhenUp={false} />}
        />
        <KpiCard
          testId="painel-vendas"
          raw={c.sales}
          icon={<ShoppingCart className="size-6" />}
          label="Vendas (1ª compra paga)"
          value={int(c.sales)}
          note={<Change cur={c.sales} prev={p.sales} />}
        />
        <KpiCard
          testId="painel-cac"
          raw={cac(c) ?? 0}
          icon={<Receipt className="size-6" />}
          label="CAC (custo por venda)"
          value={money(cac(c))}
          note={<Change cur={cac(c)} prev={cac(p)} goodWhenUp={false} />}
        />
        <KpiCard
          testId="painel-retorno"
          raw={Math.round((roas(c) ?? 0) * 100)}
          icon={<MousePointerClick className="size-6" />}
          label="Retorno"
          value={roas(c) == null ? "—" : `${(Math.round(roas(c)! * 100) / 100).toLocaleString("pt-BR")}×`}
          note={`receita ${money(c.revenue)} · CTR ${ratio(c.linkClicks, c.impressions)?.toLocaleString("pt-BR") ?? "—"}%`}
        />
      </div>

      <Card className="mt-6" data-testid="alertas">
        <h2 className="font-display text-base font-semibold text-ink">Alertas ({d.alerts.length})</h2>
        {d.alerts.length ? (
          <ul className="mt-3 grid gap-3">
            {d.alerts.map((a) => {
              const s = ALERT_STYLE[a.level];
              return (
                <li
                  key={a.id}
                  data-testid={`alerta-${a.id}`}
                  className={cn("flex items-start gap-3 rounded-xl border p-3", s.cls)}
                >
                  {s.icon}
                  <div>
                    <p className="font-bold">
                      <span className="sr-only">{s.label}: </span>
                      {a.title}
                    </p>
                    <p className="text-base">{a.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-base text-saving-dark">Nenhum alerta no período. 👍</p>
        )}
        <p className="mt-3 text-sm text-ink-soft">
          Os alertas só avisam; nada é alterado na Meta. Pausar ou mudar orçamento será feito com aprovação
          (etapa 8.6).
        </p>
      </Card>

      <Card className="mt-6">
        <h2 className="font-display text-base font-semibold text-ink">Investido e vendas por dia</h2>
        <div className="mt-3">
          <DailyChart data={d.series} label="Investido e vendas por dia" />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {(
          [
            ["Anúncios que mais vendem", d.best, "ranking-melhores", "Nenhum anúncio vendeu no período."],
            [
              "Anúncios que gastam sem vender",
              d.worst,
              "ranking-piores",
              "Nenhum anúncio gastando sem vender. 👍",
            ],
          ] as const
        ).map(([title, list, id, empty]) => (
          <Card key={id} data-testid={id}>
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            {list.length ? (
              <ol className="mt-3 grid gap-3">
                {list.map((a) => (
                  <li
                    key={a.id}
                    className="flex gap-3 border-b border-line pb-3"
                    data-testid={`${id}-${a.id}`}
                  >
                    {a.thumbnailUrl ? (
                      <img
                        src={a.thumbnailUrl}
                        alt=""
                        width={64}
                        height={64}
                        referrerPolicy="no-referrer"
                        className="size-16 shrink-0 rounded-xl bg-line object-cover"
                      />
                    ) : (
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-ink-soft">
                        <ImageOff aria-hidden="true" className="size-6" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold break-words">{a.name}</p>
                      <p className="text-sm text-ink-soft break-words">
                        {a.campaign}
                        {a.title ? ` · “${a.title}”` : ""}
                      </p>
                      <p className="text-base">
                        {money(a.spend)} investidos · <strong>{a.sales} venda(s)</strong>
                        {a.sales ? ` · CAC ${money(costPer(a.spend, a.sales))}` : ""} · CTR{" "}
                        {ratio(a.linkClicks, a.impressions)?.toLocaleString("pt-BR") ?? "—"}%
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-base text-ink-soft">{empty}</p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
