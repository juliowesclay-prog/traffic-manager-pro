/**
 * Perfis e permissões. A checagem SEMPRE acontece no servidor (rotas, ações e consultas);
 * esconder um botão na tela é só conveniência.
 */
export const ROLES = ["SUPERADMIN", "GESTOR", "MARKETING", "LEITURA"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadministrador",
  GESTOR: "Gestor de tráfego (aprova gastos)",
  MARKETING: "Marketing (opera campanhas)",
  LEITURA: "Somente leitura",
};

export const PERMISSIONS = [
  "admin:access", // entrar no painel
  "users:manage", // usuários e perfis
  "companies:manage", // empresas, acessos às empresas e chaves da API de vendas
  "audit:read",
  "traffic:read", // ver conexão, contas, campanhas e números
  "traffic:manage", // conectar/desconectar a Meta, escolher a conta e pedir ações
  "traffic:approve", // aprovar ações que aumentam o gasto, definir teto e ligar as ações
  "marketing:read", // ver o módulo Marketing (biblioteca, kit da marca)
  "marketing:manage", // enviar arquivos, criar e editar criativos e o kit da marca
  "marketing:approve", // aprovar criativos e as informações oficiais da marca
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPERADMIN: PERMISSIONS,
  GESTOR: [
    "admin:access",
    "audit:read",
    "traffic:read",
    "traffic:manage",
    "traffic:approve",
    "marketing:read",
    "marketing:manage",
    "marketing:approve",
  ],
  MARKETING: ["admin:access", "traffic:read", "traffic:manage", "marketing:read", "marketing:manage"],
  LEITURA: ["admin:access", "traffic:read", "marketing:read"],
};

export function permissionsOf(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsOf(roles).has(permission);
}

/** SUPERADMIN enxerga todas as empresas; os demais, só as liberadas para eles. */
export const seesAllCompanies = (roles: readonly Role[]) => roles.includes("SUPERADMIN");
