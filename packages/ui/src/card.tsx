import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-3xl border border-line bg-white p-6 shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

/** Cartão com ícone + título + texto (ícone sempre acompanhado de texto). */
export function FeatureCard({
  icon,
  title,
  children,
  headingLevel = 3,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Card className="flex flex-col gap-3">
      <span
        aria-hidden="true"
        className="inline-flex size-14 items-center justify-center rounded-2xl bg-navy-50 text-navy"
      >
        {icon}
      </span>
      <Heading className="text-xl font-bold text-navy">{title}</Heading>
      <div className="text-ink-soft">{children}</div>
    </Card>
  );
}
