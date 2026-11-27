import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "cta" | "secondary" | "whatsapp" | "ghost";
export type ButtonSize = "md" | "lg";

/**
 * Botões fáceis de tocar (mínimo 44px; "lg" = 48px), sempre com texto.
 * - primary: azul cobalto, ação principal da tela.
 * - secondary: contorno neutro, ações de apoio.
 * - cta: vermelho, só para ação destrutiva ou de alerta.
 */
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-dark",
  cta: "bg-red text-white hover:bg-red-dark",
  secondary: "border border-slate-300 bg-surface text-ink hover:border-ink-faint hover:bg-navy-50",
  whatsapp: "bg-whatsapp text-white hover:bg-whatsapp-dark",
  ghost: "text-ink hover:bg-navy-50",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 py-2 text-base text-left",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold leading-tight transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    extra,
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant,
  size,
  icon,
  className,
  children,
  type = "button",
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...props}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

/** Link com aparência de botão (navegação). Para Next.js, passe `as` = Link. */
export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClasses(variant, size, className)} {...props}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </a>
  );
}
