import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "cta" | "secondary" | "whatsapp" | "ghost";
export type ButtonSize = "md" | "lg";

/**
 * Botões grandes e fáceis de tocar (mínimo 48px; "lg" = 64px), sempre com texto.
 * - cta: vermelho da marca, para a ação principal da tela ("Quero ser associado").
 * - primary: azul-marinho da marca.
 */
const variants: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy-soft",
  cta: "bg-red text-white hover:bg-red-dark",
  secondary: "border-2 border-navy bg-white text-navy hover:bg-navy-50",
  whatsapp: "bg-whatsapp text-white hover:bg-whatsapp-dark",
  ghost: "text-navy underline-offset-4 hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-12 px-5 text-base",
  lg: "min-h-16 px-5 py-3 text-lg text-left sm:px-7 sm:text-xl",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-3 rounded-2xl font-bold leading-tight transition-colors",
    "focus-visible:outline-3 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-60",
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
