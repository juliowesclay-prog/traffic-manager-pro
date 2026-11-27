import type { Permission } from "@tmp/core";

/**
 * Menu do painel, agrupado como no protótipo aprovado. Cada item só aparece para quem tem a
 * permissão (e a página confere de novo no servidor).
 */
export const ADMIN_NAV_GROUPS = [
  {
    label: "Resultados",
    items: [
      { href: "/admin/trafego/painel", label: "Painel", icon: "LayoutDashboard", permission: "traffic:read" },
      { href: "/admin/trafego/campanhas", label: "Campanhas", icon: "Megaphone", permission: "traffic:read" },
      {
        href: "/admin/trafego/vendas",
        label: "Vendas por anúncio",
        icon: "ShoppingCart",
        permission: "traffic:read",
      },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { href: "/admin/trafego/ia", label: "IA analista", icon: "Sparkles", permission: "traffic:read" },
      { href: "/admin/trafego/acoes", label: "Ações", icon: "ShieldCheck", permission: "traffic:read" },
      { href: "/admin/trafego/conversoes", label: "Conversões", icon: "Send", permission: "traffic:read" },
    ],
  },
  {
    label: "Criação",
    items: [
      { href: "/admin/marketing", label: "Marketing", icon: "Palette", permission: "marketing:read" },
    ],
  },
  {
    label: "Configuração",
    items: [
      { href: "/admin/trafego", label: "Conexão Meta", icon: "Link2", permission: "traffic:read" },
      {
        href: "/admin/fonte-de-vendas",
        label: "Fonte de vendas",
        icon: "PlugZap",
        permission: "traffic:read",
      },
      { href: "/admin/empresas", label: "Empresas", icon: "Building2", permission: "companies:manage" },
      { href: "/admin/usuarios", label: "Equipe e acessos", icon: "Users", permission: "users:manage" },
      { href: "/admin/auditoria", label: "Auditoria", icon: "ScrollText", permission: "audit:read" },
    ],
  },
] as const satisfies readonly {
  label: string;
  items: readonly { href: string; label: string; icon: string; permission: Permission }[];
}[];
