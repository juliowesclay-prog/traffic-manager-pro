"use client";

import {
  Building2,
  LayoutDashboard,
  Link2,
  Megaphone,
  PlugZap,
  ScrollText,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@tmp/ui";

const ICONS = {
  Building2,
  LayoutDashboard,
  Link2,
  Megaphone,
  PlugZap,
  ScrollText,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Menu lateral agrupado, com destaque da página atual (aria-current). */
export function AdminNavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  // Item ativo = o de caminho mais específico que contém a página atual (ex.: /admin/trafego/painel
  // destaca "Painel", e não "Conexão Meta", que é /admin/trafego).
  const all = groups.flatMap((g) => g.items);
  const matches = all.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const activeHref = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-[0.07em] text-side-faint uppercase">
            {group.label}
          </p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium transition-colors",
                      active ? "bg-accent text-white" : "text-side-ink hover:bg-side-2 hover:text-white",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn("size-[18px] shrink-0", !active && "opacity-75")}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
