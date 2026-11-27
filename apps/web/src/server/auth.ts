import "server-only";
import { redirect } from "next/navigation";
import { can, permissionsOf, requiresMfa, type Permission, type Role } from "@tmp/core";
import { activeCompany } from "./company";
import { currentSession, type ActiveSession } from "./session";

export interface AuthContext {
  session: ActiveSession;
  user: ActiveSession["user"];
  roles: Role[];
}

/** Usuário logado (ou null). Equipe sem MFA confirmado NÃO conta como autenticada para o painel. */
export async function getAuth(): Promise<AuthContext | null> {
  const session = await currentSession();
  if (!session) return null;
  return { session, user: session.user, roles: session.user.roles.map((r) => r.role as Role) };
}

/** Páginas do painel: exige perfil de equipe, MFA confirmado nesta sessão e a permissão pedida. */
export async function requireStaff(
  permission: Permission = "admin:access",
  opts: { allowPasswordChange?: boolean } = {},
): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth || !can(auth.roles, "admin:access")) redirect("/admin/entrar");
  if (!auth.user.mfaEnabledAt) redirect("/admin/mfa/configurar");
  if (!auth.session.mfaVerified) redirect("/admin/verificar");
  // Senha provisória criada por um administrador: troca obrigatória antes de usar o painel.
  if (auth.user.mustChangePassword && !opts.allowPasswordChange) redirect("/admin/conta");
  if (!can(auth.roles, permission)) redirect("/admin/sem-permissao");
  return auth;
}

/**
 * Páginas de uma empresa (Gestor de Tráfego, fonte de vendas): além de requireStaff, exige uma empresa
 * aberta. Sem nenhuma empresa liberada para o usuário, vai para a tela de aviso.
 */
export async function requireCompanyStaff(permission: Permission = "traffic:read") {
  const auth = await requireStaff(permission);
  const company = await activeCompany();
  if (!company) redirect("/admin/sem-empresa");
  return { ...auth, company };
}

/**
 * Guarda para rotas de API. Retorna o contexto ou uma Response pronta (401/403).
 * Uso: const auth = await apiGuard("traffic:read"); if (auth instanceof Response) return auth;
 */
export async function apiGuard(permission: Permission): Promise<AuthContext | Response> {
  const auth = await getAuth();
  if (!auth) return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  if (requiresMfa(auth.roles) && !auth.session.mfaVerified) {
    return Response.json({ erro: "mfa_obrigatorio" }, { status: 403 });
  }
  if (auth.user.mustChangePassword)
    return Response.json({ erro: "troca_de_senha_obrigatoria" }, { status: 403 });
  if (!can(auth.roles, permission)) return Response.json({ erro: "sem_permissao" }, { status: 403 });
  return auth;
}

export function permissionList(roles: Role[]): Permission[] {
  return [...permissionsOf(roles)].sort();
}

/** Requisições que alteram dados por API precisam vir do próprio site (defesa extra contra CSRF). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
