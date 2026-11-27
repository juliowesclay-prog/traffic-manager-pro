"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@tmp/ui";
import { MARKETING_SECTIONS } from "./sections";

/** Abas do módulo Marketing (rolam de lado no celular). */
export function MarketingTabs() {
  const pathname = usePathname();
  const tabs = [{ href: "/admin/marketing", label: "Início" }, ...MARKETING_SECTIONS];
  return (
    <nav aria-label="Seções do Marketing" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active =
            t.href === "/admin/marketing" ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap",
                  active ? "border-accent text-accent-dark" : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
