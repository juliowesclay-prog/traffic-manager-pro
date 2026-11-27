"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@prosed/ui";

const TABS = [
  { href: "/admin/trafego/painel", label: "Painel" },
  { href: "/admin/trafego", label: "Conexão" },
  { href: "/admin/trafego/campanhas", label: "Campanhas" },
  { href: "/admin/trafego/vendas", label: "Vendas por anúncio" },
  { href: "/admin/trafego/ia", label: "IA analista" },
  { href: "/admin/trafego/acoes", label: "Ações" },
  { href: "/admin/trafego/conversoes", label: "Conversões" },
];

export function TrafficTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do gestor de tráfego" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-12 items-center rounded-xl border-2 px-4 font-bold",
              active ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
