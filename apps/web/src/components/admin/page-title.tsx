import type { ReactNode } from "react";

export function AdminPageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-navy">{title}</h1>
        {subtitle ? <p className="mt-1 text-base text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}
