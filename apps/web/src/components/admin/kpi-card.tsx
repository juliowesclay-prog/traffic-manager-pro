import type { ReactNode } from "react";

/** Indicador grande (número + rótulo + contexto), como no modelo de referência. */
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
      className="rounded-3xl border border-line bg-white p-5 shadow-card"
      data-testid={testId}
      data-valor={raw ?? undefined}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`grid size-11 place-items-center rounded-xl ${
            tone === "alert" ? "bg-red-50 text-red" : "bg-navy-50 text-navy"
          }`}
        >
          {icon}
        </span>
        <p className="text-sm font-bold text-ink-soft">{label}</p>
      </div>
      <p className="mt-4 font-display text-4xl font-extrabold whitespace-nowrap text-navy">{value}</p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}
