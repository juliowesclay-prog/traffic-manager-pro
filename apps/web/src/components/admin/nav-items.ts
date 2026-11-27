import type { Permission } from "@tmp/core";

/** Menu do painel. Cada item só aparece para quem tem a permissão (e a página confere de novo no servidor). */
export const ADMIN_NAV = [
  { href: "/admin/trafego", label: "Gestor de Tráfego", icon: "Megaphone", permission: "traffic:read" },
  { href: "/admin/fonte-de-vendas", label: "Fonte de vendas", icon: "PlugZap", permission: "traffic:read" },
  { href: "/admin/empresas", label: "Empresas", icon: "Building2", permission: "companies:manage" },
  { href: "/admin/usuarios", label: "Equipe e acessos", icon: "ShieldCheck", permission: "users:manage" },
  { href: "/admin/auditoria", label: "Auditoria", icon: "ScrollText", permission: "audit:read" },
] as const satisfies readonly { href: string; label: string; icon: string; permission: Permission }[];
