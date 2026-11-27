import type { Metadata } from "next";
import Link from "next/link";
import { Info, Receipt, ShoppingCart, Users, Wallet } from "lucide-react";
import { costPer, formatBRL, REPORT_PERIODS } from "@tmp/core";
import { Card, cn } from "@tmp/ui";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminPageTitle } from "@/components/admin/page-title";
import { META_URL_PARAMS } from "@/lib/attribution";
import { requireCompanyStaff } from "@/server/auth";
import { cac, roas, salesByAd, type SalesRow } from "@/server/traffic/sales";

export const metadata: Metadata = { title: "Vendas por anúncio" };

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const money = (c: number | null) => (c == null ? "—" : c < 0 ? `−${formatBRL(-c)}` : formatBRL(c));
const times = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}×`);

function Cells({ r }: { r: SalesRow }) {
  const noSpend = r.kind !== "campanha";
  return (
    <>
      <td className="px-2 py-2 text-right whitespace-nowrap" data-valor={r.spend}>
        {noSpend ? "—" : money(r.spend)}
      </td>
      <td className="px-2 py-2 text-right" data-valor={r.signups}>
        {r.kind === "sem_origem" ? "—" : r.signups.toLocaleString("pt-BR")}
      </td>
      <td className="px-2 py-2 text-right font-bold" data-valor={r.sales}>
        {r.sales.toLocaleString("pt-BR")}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap" data-valor={r.revenue}>
        {r.kind === "sem_origem" ? "—" : money(r.revenue)}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        {noSpend ? "—" : money(costPer(r.spend, r.signups))}
      </td>
      <td className="px-2 py-2 text-right font-bold whitespace-nowrap" data-testid={`cac-${r.key}`}>
        {noSpend ? "—" : money(cac(r))}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">{noSpend ? "—" : times(roas(r))}</td>
    </>
  );
}

export default async function SalesByAdPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireCompanyStaff("traffic:read");
  const q = await searchParams;
  const days = (REPORT_PERIODS as readonly number[]).includes(Number(q.periodo)) ? Number(q.periodo) : 30;
  const r = await salesByAd(days);

  return (
    <>
      <AdminPageTitle
        title="Vendas por anúncio"
        subtitle="Quanto cada campanha custou e quantas vendas pagas trouxe de verdade"
      />

      {!r.account ? (
        <Card>
          <p className="text-base">
            Conecte a Meta e escolha a conta de anúncios para ver as vendas por anúncio.{" "}
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
              DEMO — investimento simulado e cadastros de teste. Não use para decisões.
            </p>
          ) : null}

          <form method="get" action="/admin/trafego/vendas" className="flex flex-wrap items-end gap-3">
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
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-[10px] border border-slate-300 bg-white px-4 text-sm font-semibold text-ink hover:bg-navy-50"
            >
              Ver
            </button>
          </form>
          <p className="mt-2 text-sm text-ink-soft">
            {br(r.since)} a {br(r.until)}. Vendas = primeira compra paga no período (fonte de vendas). Receita
            = compras pagas no período, menos estornos.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              testId="vendas-investido"
              raw={r.totals.spend}
              icon={<Wallet className="size-6" />}
              label="Investido (Meta)"
              value={money(r.totals.spend)}
            />
            <KpiCard
              testId="vendas-cadastros"
              raw={r.totals.signups}
              icon={<Users className="size-6" />}
              label="Cadastros vindos da Meta"
              value={r.totals.signups.toLocaleString("pt-BR")}
              note={`custo por cadastro ${money(costPer(r.totals.spend, r.totals.signups))}`}
            />
            <KpiCard
              testId="vendas-vendas"
              raw={r.totals.sales}
              icon={<ShoppingCart className="size-6" />}
              label="Vendas (1ª compra paga)"
              value={r.totals.sales.toLocaleString("pt-BR")}
              note={`CAC ${money(cac(r.totals))}`}
            />
            <KpiCard
              testId="vendas-receita"
              raw={r.totals.revenue}
              icon={<Receipt className="size-6" />}
              label="Receita recebida"
              value={money(r.totals.revenue)}
              note={`retorno ${times(roas(r.totals))} o investido`}
            />
          </div>

          {r.withoutIds > 0 ? (
            <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-4 font-bold text-amber-950">
              {r.withoutIds} cadastro(s) vieram do Facebook/Instagram sem a identificação do anúncio.
              Configure os parâmetros de URL nos anúncios (abaixo) para saber qual campanha vendeu.
            </p>
          ) : null}

          <Card className="mt-6" data-testid="vendas-por-campanha">
            <h2 className="font-display text-base font-semibold text-ink">Por campanha</h2>
            <div
              className="mt-3 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Tabela de vendas por campanha"
            >
              <table className="w-full min-w-[56rem] text-left text-base">
                <thead>
                  <tr className="text-sm text-ink-soft">
                    <th scope="col" className="px-2 py-2">
                      Origem
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Investido
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Cadastros
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Vendas
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Receita
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Custo por cadastro
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      CAC
                    </th>
                    <th scope="col" className="px-2 py-2 text-right">
                      Retorno
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <FragmentRows key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              CAC = investido ÷ vendas. Retorno = receita ÷ investido (1× = pagou o anúncio). A origem é o
              último clique em link de anúncio nos 30 dias antes do cadastro.
            </p>
          </Card>

          <Card className="mt-6">
            <h2 className="font-display text-base font-semibold text-ink">Como identificar cada anúncio</h2>
            <p className="mt-1 text-base">
              No Gerenciador de Anúncios da Meta, em cada anúncio, cole no campo{" "}
              <strong>Parâmetros de URL</strong>:
            </p>
            <pre
              className="mt-3 overflow-x-auto rounded-xl bg-navy-50 p-3 text-sm whitespace-pre-wrap break-all text-navy"
              data-testid="parametros-url"
            >
              {META_URL_PARAMS}
            </pre>
            <p className="mt-2 text-sm text-ink-soft">
              A Meta troca os campos entre chaves pelos números da campanha, do conjunto e do anúncio. Sem
              isso, as vendas aparecem como &quot;Facebook/Instagram sem identificação&quot;.
            </p>
          </Card>
        </>
      )}
    </>
  );
}

function FragmentRows({ row }: { row: SalesRow }) {
  return (
    <>
      <tr
        className={cn("border-t border-line", row.kind !== "campanha" && "text-ink-soft")}
        data-testid={`linha-${row.key}`}
      >
        <th scope="row" className="px-2 py-2 font-bold break-words">
          {row.label}
        </th>
        <Cells r={row} />
      </tr>
      {row.ads?.map((a) => (
        <tr key={a.key} className="text-sm" data-testid={`linha-anuncio-${a.key}`}>
          <th scope="row" className="py-1 pr-2 pl-8 font-normal break-words">
            ↳ {a.label}
          </th>
          <Cells r={a} />
        </tr>
      ))}
    </>
  );
}
