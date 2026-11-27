/**
 * Perfis e permissões. A checagem SEMPRE acontece no servidor (rotas, ações e consultas);
 * esconder um botão na tela é só conveniência.
 */
export const ROLES = [
  "SUPERADMIN",
  "FINANCEIRO",
  "ATENDIMENTO",
  "GESTOR_PARCEIROS",
  "PARCEIRO",
  "ASSOCIADO",
  "MARKETING",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadministrador",
  FINANCEIRO: "Financeiro",
  ATENDIMENTO: "Atendimento",
  GESTOR_PARCEIROS: "Gestor de parceiros",
  PARCEIRO: "Parceiro credenciado",
  ASSOCIADO: "Associado",
  MARKETING: "Marketing (tráfego pago)",
};

export const PERMISSIONS = [
  "admin:access", // entrar no painel administrativo
  "users:manage", // usuários da equipe e perfis
  "settings:manage", // marca, WhatsApp, dados da empresa
  "audit:read",
  "members:read", // dados de associados (CPF sempre mascarado)
  "members:write",
  "subscriptions:read",
  "subscriptions:write",
  "plans:manage",
  "finance:read", // receitas, despesas, relatórios financeiros
  "finance:write",
  "refunds:create",
  "partners:read",
  "partners:manage", // credenciamento, unidades, serviços e ofertas
  "offers:approve",
  "referrals:manage",
  "contracts:manage",
  "privacy:manage", // pedidos do titular (LGPD): exportar dados e anonimizar
  "traffic:read", // Gestor de Tráfego IA: ver conexão, contas, campanhas e números
  "traffic:manage", // Gestor de Tráfego IA: conectar/desconectar a Meta, escolher a conta e pedir ações
  "traffic:approve", // Gestor de Tráfego IA: aprovar ações que aumentam o gasto, definir teto e ligar as ações
  "partner-portal:access", // portal do parceiro (somente dados do próprio parceiro)
  "card:validate", // validar carteirinha
  "member-area:access", // área do associado (somente os próprios dados)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF_BASE: Permission[] = ["admin:access"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPERADMIN: PERMISSIONS.filter((p) => p !== "partner-portal:access" && p !== "member-area:access"),
  FINANCEIRO: [
    ...STAFF_BASE,
    "finance:read",
    "finance:write",
    "refunds:create",
    "subscriptions:read",
    "subscriptions:write",
    "plans:manage",
    "members:read",
    "referrals:manage",
  ],
  ATENDIMENTO: [...STAFF_BASE, "members:read", "members:write", "subscriptions:read", "partners:read"],
  GESTOR_PARCEIROS: [...STAFF_BASE, "partners:read", "partners:manage", "offers:approve"],
  PARCEIRO: ["partner-portal:access", "card:validate"],
  ASSOCIADO: ["member-area:access"],
  MARKETING: [...STAFF_BASE, "traffic:read", "traffic:manage"],
};

export function permissionsOf(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsOf(roles).has(permission);
}

/** Qualquer perfil diferente de ASSOCIADO é "equipe" e exige MFA. */
export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((r) => r !== "ASSOCIADO");
}
