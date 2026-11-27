"use client";

import { Building2, Megaphone, PlugZap, ScrollText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@tmp/ui";

const ICONS = { Building2, Megaphone, PlugZap, ScrollText, ShieldCheck };

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

/** Links do menu com destaque da página atual (aria-current). */
export function AdminNavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Item ativo = o de caminho mais específico que contém a página atual (ex.: /admin/trafego/painel
  // destaca "Gestor de Tráfego").
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const activeHref = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-bold",
                active ? "bg-navy text-white" : "text-navy hover:bg-navy-50",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
