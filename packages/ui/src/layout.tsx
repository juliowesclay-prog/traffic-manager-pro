import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props}>
      {children}
    </div>
  );
}

/** Seção com título; o id do título rotula a seção para leitores de tela. */
export function Section({
  id,
  title,
  intro,
  children,
  className,
  tone = "plain",
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "plain" | "white" | "navy";
}) {
  const bg = { plain: "", white: "bg-surface", navy: "bg-navy text-canvas" }[tone];
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cn("py-14 sm:py-20", bg, className)}>
      <Container>
        <h2
          id={`${id}-titulo`}
          className={cn(
            "font-display text-3xl font-extrabold sm:text-4xl",
            tone === "navy" ? "text-white" : "text-navy",
          )}
        >
          {title}
        </h2>
        {intro ? (
          <div className={cn("mt-3 max-w-3xl text-xl", tone === "navy" ? "text-white/90" : "text-ink-soft")}>
            {intro}
          </div>
        ) : null}
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
