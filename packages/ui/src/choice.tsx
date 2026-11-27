import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/** Lista de opções nativa (melhor suporte a leitores de tela e celulares), com rótulo e erro. */
export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = hint ? `${selectId}-dica` : undefined;
  const errorId = error ? `${selectId}-erro` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={selectId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          // w-full + min-w-0: opções com texto longo não alargam a tela no celular.
          "min-h-11 w-full min-w-0 max-w-full truncate rounded-lg border bg-surface px-3 text-base text-ink disabled:bg-slate-100",
          error ? "border-red" : "border-slate-300 focus:border-accent",
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="flex items-center gap-2 text-sm font-semibold text-red-dark">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      ) : null}
    </div>
  );
}

/** Caixa de marcação grande (28px) com texto clicável. */
export function Checkbox({
  label,
  error,
  className,
  id,
  ...props
}: { label: ReactNode; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-erro` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-5 shrink-0 accent-accent"
          {...props}
        />
        <label htmlFor={inputId} className="text-base">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} className="flex items-center gap-2 text-sm font-semibold text-red-dark">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      ) : null}
    </div>
  );
}

/** Área de texto com rótulo, dica e erro. */
export function TextAreaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: { label: string; hint?: ReactNode; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-dica` : undefined;
  const errorId = error ? `${fieldId}-erro` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {label}
        {props.required ? null : <span className="font-normal text-ink-soft"> (opcional)</span>}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
      <textarea
        id={fieldId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "rounded-lg border bg-surface p-3 text-base text-ink",
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
