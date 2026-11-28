import type { Metadata } from "next";
import Link from "next/link";
import {
  byKind,
  CREATIVE_KIND_LABELS,
  formatBRL,
  performanceReading,
  rates,
  type AdNumbers,
} from "@tmp/core";
import { Card } from "@tmp/ui";
import { AdminPageTitle } from "@/components/admin/page-title";
import { requireCompanyStaff } from "@/server/auth";
import { creativePerformance } from "@/server/marketing/performance";

export const metadata: Metadata = { title: "Desempenho dos criativos" };

const PERIODS = [7, 14, 30] as const;
const money = (v: number | null) => (v == null ? "—" : formatBRL(v));
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);
const br = (iso: string) => iso.split("-").reverse().join("/");

function Cells({ n }: { n: AdNumbers }) {
  const r = rates(n);
  return (
    <>
      <td className="py-2 pr-3 text-right">{money(n.spend)}</td>
      <td className="py-2 pr-3 text-right">{num(n.impressions)}</td>
      <td className="py-2 pr-3 text-right">{pct(r.ctr)}</td>
      <td className="py-2 pr-3 text-right">{money(r.cpc)}</td>
      <td className="py-2 pr-3 text-right">{num(n.leads)}</td>
      <td className="py-2 pr-3 text-right">{money(r.cpl)}</td>
      <td className="py-2 pr-3 text-right">{num(n.sales)}</td>
      <td className="py-2 pr-3 text-right">{money(r.cac)}</td>
      <td className="py-2 pr-3 text-right">{money(n.revenue)}</td>
    </>
  );
}

function Head({ first }: { first: string }) {
  return (
    <thead className="text-ink-soft">
      <tr>
        <th className="py-2 pr-3">{first}</th>
        <th className="py-2 pr-3 text-right">Investido</th>
        <th className="py-2 pr-3 text-right">Impressões</th>
        <th className="py-2 pr-3 text-right">CTR</th>
        <th className="py-2 pr-3 text-right">CPC</th>
        <th className="py-2 pr-3 text-right">Cadastros</th>
        <th className="py-2 pr-3 text-right">Custo/cadastro</th>
        <th className="py-2 pr-3 text-right">Vendas reais</th>
        <th className="py-2 pr-3 text-right">Custo/venda</th>
        <th className="py-2 pr-3 text-right">Receita</th>
      </tr>
    </thead>
  );
}

/** Desempenho (Etapa 7): qual criativo traz resultado, com o período sempre citado. */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; criativo?: string }>;
}) {
  await requireCompanyStaff("marketing:read");
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.dias) ?? 30;
  const data = await creativePerformance(days);

  return (
    <>
      <AdminPageTitle
        title="Desempenho dos criativos"
        subtitle="Números da Meta por criativo, somando os anúncios ligados a ele, com as vendas reais da fonte de vendas."
      />
      {!data.account ? (
        <Card>
          <p>Conecte a Meta e escolha a conta de anúncios no Gestor de Tráfego para ver o desempenho.</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Período">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/admin/marketing/desempenho?dias=${p}`}
                aria-current={p === days ? "page" : undefined}
                className={`rounded-full border px-3 py-1 font-semibold ${p === days ? "border-accent-text bg-surface text-accent-text" : "border-line text-ink-soft"}`}
              >
                Últimos {p} dias
              </Link>
            ))}
            <span className="text-ink-soft" data-testid="periodo">
              Período: {br(data.since)} a {br(data.until)} · conta {data.account.name}
              {data.account.isDemo ? " (DEMO)" : ""}
            </span>
          </nav>

          {!data.creatives.length ? (
            <Card>
              <p>
                Nenhum criativo ligado a anúncios ainda. Envie um criativo aprovado pela tela{" "}
                <Link
                  href="/admin/marketing/enviar-meta"
                  className="font-semibold text-accent-text underline"
                >
                  Enviar para Meta
                </Link>{" "}
                ou vincule um anúncio existente na página do criativo.
              </p>
            </Card>
          ) : (
            <>
              <Card data-testid="leitura-desempenho">
                <h2 className="font-display text-base font-semibold text-ink">Leitura do período</h2>
                <ul className="mt-2 grid list-disc gap-1 pl-5">
                  {performanceReading(data.creatives, `Nos últimos ${days} dias`).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-ink-soft">
                  “Vendas reais” vêm da fonte de vendas (primeira compra paga de quem chegou pelo anúncio).
                  Cadastros são os leads informados pela Meta.
                </p>
              </Card>
              <Card data-testid="ranking-criativos">
                <h2 className="font-display text-base font-semibold text-ink">Ranking dos criativos</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <Head first="Criativo" />
                    <tbody>
                      {data.creatives.map((c, i) => (
                        <tr
                          key={c.id}
                          className={`border-t border-line ${sp.criativo === c.id ? "bg-canvas" : ""}`}
                        >
                          <td className="py-2 pr-3">
                            {i + 1}.{" "}
                            <Link
                              href={`/admin/marketing/biblioteca/${c.id}`}
                              className="font-semibold text-accent-text underline"
                            >
                              {c.name}
                            </Link>
                            <span className="block text-ink-soft">
                              {CREATIVE_KIND_LABELS[c.kind]} · {c.ads} anúncio(s)
                            </span>
                          </td>
                          <Cells n={c.numbers} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card data-testid="por-tipo">
                <h2 className="font-display text-base font-semibold text-ink">Comparação por tipo</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <Head first="Tipo" />
                    <tbody>
                      {byKind(data.creatives).map((k) => (
                        <tr key={k.kind} className="border-t border-line">
                          <td className="py-2 pr-3 font-semibold">
                            {CREATIVE_KIND_LABELS[k.kind]}
                            <span className="block font-normal text-ink-soft">{k.creatives} criativo(s)</span>
                          </td>
                          <Cells n={k.numbers} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
