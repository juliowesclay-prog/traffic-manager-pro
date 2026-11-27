import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Empresa "da vez" para as consultas separadas por empresa (ver server/db.ts).
 * - Telas e ações do painel: vem da sessão (empresa aberta pelo usuário), conferida a cada requisição.
 * - Rotinas automáticas e API da fonte de vendas: definida explicitamente com runWithCompany().
 * Sem empresa definida, a consulta FALHA (nunca devolve dados de todas as empresas).
 */
const store = new AsyncLocalStorage<{ companyId: string }>();

export class NoCompanyError extends Error {
  constructor() {
    super("Nenhuma empresa aberta nesta requisição.");
    this.name = "NoCompanyError";
  }
}

export function runWithCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ companyId }, fn);
}

type Resolver = () => Promise<string | null>;
let requestResolver: Resolver | null = null;
/** Registrado por server/company.ts (evita import circular com a sessão). */
export function setRequestCompanyResolver(fn: Resolver) {
  requestResolver = fn;
}

export async function currentCompanyId(): Promise<string> {
  const fixed = store.getStore();
  if (fixed) return fixed.companyId;
  const id = requestResolver ? await requestResolver() : null;
  if (!id) throw new NoCompanyError();
  return id;
}
