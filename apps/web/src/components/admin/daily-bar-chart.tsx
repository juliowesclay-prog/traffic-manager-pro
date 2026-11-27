/**
 * Barras de cadastros por dia (série única → sem legenda; o título nomeia a série).
 * Marcas finas com topo arredondado, 2px de espaço entre barras, grade discreta, dica ao passar o mouse
 * (<title>) e tabela equivalente para leitores de tela.
 */
export function DailyBarChart({ data, label }: { data: { day: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const W = 600;
  const H = 180;
  const padL = 28;
  const padR = 20;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padB - padT;
  const step = plotW / data.length;
  const barW = Math.max(4, step - 2);
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <figure className="grid gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label}. Tabela com os valores abaixo.`}
      >
        {ticks.map((t) => {
          const y = padT + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#dfe5ef" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#3f4b63">
                {t}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.count / niceMax) * plotH;
          const x = padL + i * step + (step - barW) / 2;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day} className="group">
              {/* área de toque maior que a barra */}
              <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="transparent" />
              {d.count > 0 ? (
                <path
                  d={`M${x},${padT + plotH} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                  className="fill-navy group-hover:fill-red"
                />
              ) : null}
              <title>{`${fmt(d.day)}: ${d.count} cadastro${d.count === 1 ? "" : "s"}`}</title>
              {i % 5 === 0 || i === data.length - 1 ? (
                <text
                  x={padL + i * step + step / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#3f4b63"
                >
                  {fmt(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="cursor-pointer text-sm font-bold text-navy">Ver em tabela</summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="text-left text-ink-soft">
              <th scope="col">Dia</th>
              <th scope="col">Cadastros</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td>{fmt(d.day)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
