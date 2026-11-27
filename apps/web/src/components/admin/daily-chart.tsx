import { formatBRL } from "@tmp/core";

/**
 * Investido por dia (barras) e vendas por dia (pontos com número). Acessível: o gráfico tem um resumo
 * e a mesma informação vem numa tabela que abre em "Ver em tabela".
 */
export function DailyChart({
  data,
  label,
}: {
  data: { day: string; spend: number; sales: number }[];
  label: string;
}) {
  const W = 720;
  const H = 220;
  const padX = 12;
  const padT = 24;
  const padB = 28;
  const plotW = W - 2 * padX;
  const plotH = H - padT - padB;
  const maxSpend = Math.max(1, ...data.map((d) => d.spend));
  const step = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(18, step - 3));
  const labelEvery = Math.ceil(data.length / 10);
  const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const totalSales = data.reduce((s, d) => s + d.sales, 0);
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);

  return (
    <figure className="grid gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label}: ${formatBRL(totalSpend)} investidos e ${totalSales} venda(s) em ${data.length} dias. Valores por dia na tabela abaixo.`}
      >
        <line x1={padX} x2={W - padX} y1={padT + plotH} y2={padT + plotH} stroke="#e2e6ee" strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.spend / maxSpend) * plotH;
          const cx = padX + i * step + step / 2;
          return (
            <g key={d.day}>
              {d.spend > 0 ? (
                <rect
                  x={cx - barW / 2}
                  y={padT + plotH - h}
                  width={barW}
                  height={h}
                  rx={2}
                  className="fill-accent"
                />
              ) : null}
              {d.sales > 0 ? (
                <>
                  <circle cx={cx} cy={padT + plotH - h - 10} r={8} className="fill-amber-400" />
                  <text
                    x={cx}
                    y={padT + plotH - h - 6.5}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#1B1405"
                  >
                    {d.sales}
                  </text>
                </>
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#465068">
                  {short(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-sm text-ink-soft">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-accent" /> Investido por dia
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-full bg-amber-400" /> Vendas vindas
          da Meta
        </span>
      </figcaption>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">
          Ver em tabela
        </summary>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label} em tabela`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-sm text-ink-soft">
                <th scope="col" className="py-1">
                  Dia
                </th>
                <th scope="col" className="py-1 text-right">
                  Investido
                </th>
                <th scope="col" className="py-1 text-right">
                  Vendas
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <th scope="row" className="py-1 font-normal">
                    {short(d.day)}
                  </th>
                  <td className="py-1 text-right">{formatBRL(d.spend)}</td>
                  <td className="py-1 text-right">{d.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
