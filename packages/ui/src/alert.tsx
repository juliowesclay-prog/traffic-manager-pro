import type { ReactNode } from "react";
import { cn } from "./cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, string> = {
  info: "border-accent/25 bg-accent-50 text-ink",
  success: "border-saving/40 bg-saving-50 text-saving-dark",
  warning: "border-amber-400/70 bg-amber-50 text-amber-950",
  danger: "border-red/40 bg-red-50 text-red-dark",
};

/**
 * Mensagem de feedback. Avisos importantes usam role="alert" (lidos na hora pelo leitor de tela);
 * informativos usam role="status". Cor nunca é o único sinal: sempre há título e texto.
 */
export function Alert({
  tone = "info",
  title,
  children,
  icon,
  action,
  urgent = tone === "danger" || tone === "warning",
  className,
}: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start",
        tones[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
