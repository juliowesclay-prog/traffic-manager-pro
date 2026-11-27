import type { ReactNode } from "react";

/** Indicador (rótulo + número + comparação). Usado no topo dos painéis. */
export function KpiCard({
  icon,
  label,
  value,
  note,
  testId,
  raw,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: ReactNode;
  /** Identificador estável para testes automatizados. */
  testId?: string;
  /** Valor bruto (centavos ou contagem) exposto em data-valor para testes. */
  raw?: number | null;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 shadow-card sm:p-5"
      data-testid={testId}
      data-valor={raw ?? undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`grid size-7 place-items-center rounded-md [&>svg]:size-4 ${
            tone === "alert" ? "bg-red-50 text-red" : "bg-accent-50 text-accent-dark"
          }`}
        >
          {icon}
        </span>
        <p className="text-xs font-semibold tracking-wide text-ink-soft">{label}</p>
      </div>
      <p className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink">
        {value}
      </p>
      {note ? <p className="text-xs text-ink-soft">{note}</p> : null}
    </div>
  );
}
