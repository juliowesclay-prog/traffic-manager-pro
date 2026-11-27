import "server-only";
import type { Permission } from "@tmp/core";
import { apiGuard, isSameOrigin, type AuthContext } from "../auth";
import { activeCompany } from "../company";

/** Guarda das rotas do Marketing: login + permissão + empresa aberta (+ mesma origem ao alterar). */
export async function marketingGuard(
  request: Request,
  permission: Permission,
): Promise<(AuthContext & { companyId: string }) | Response> {
  if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request))
    return Response.json({ erro: "origem_invalida" }, { status: 403 });
  const auth = await apiGuard(permission);
  if (auth instanceof Response) return auth;
  const company = await activeCompany();
  if (!company) return Response.json({ erro: "sem_empresa" }, { status: 403 });
  return { ...auth, companyId: company.id };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
