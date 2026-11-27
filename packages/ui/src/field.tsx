import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Campo de formulário acessível: rótulo sempre visível (nunca só placeholder), dica e erro
 * ligados ao campo por aria-describedby, campo com 56px de altura e fonte grande.
 */
export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-dica` : undefined;
  const errorId = error ? `${inputId}-erro` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
        {props.required ? null : <span className="font-normal text-ink-soft"> (opcional)</span>}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-ink",
          error ? "border-red" : "border-slate-300 focus:border-accent",
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="flex items-center gap-2 text-sm font-semibold text-red-dark">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      ) : null}
    </div>
  );
}
