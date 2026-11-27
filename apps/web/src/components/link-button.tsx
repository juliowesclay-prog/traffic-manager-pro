import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@tmp/ui";

/** Link interno (Next.js) com aparência de botão grande. */
export function LinkButton({
  href,
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </Link>
  );
}
