import "server-only";
import { headers } from "next/headers";

/**
 * IP do cliente, usado em limites de tentativas e auditoria.
 *
 * O cabeçalho X-Forwarded-For pode ser falsificado pelo visitante; só confiamos nas entradas
 * acrescentadas pelos NOSSOS proxies. TRUST_PROXY_HOPS = quantos proxies confiáveis existem na frente
 * do site (ex.: 1 com um balanceador). Pegamos a entrada nessa posição contada da direita.
 * Com 0 (padrão), o cabeçalho é ignorado.
 */
export async function clientIp(): Promise<string> {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops <= 0) return "direto";
  const chain = ((await headers()).get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? "desconhecido";
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}
