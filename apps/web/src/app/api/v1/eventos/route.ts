import { companyFromApiKey } from "@/server/company";
import { rateLimit } from "@/server/rate-limit";
import { ingestSalesEvents } from "@/server/sales-source";
import { runWithCompany } from "@/server/tenant";

/**
 * API da fonte de vendas: POST /api/v1/eventos
 * Cabeçalho: Authorization: Bearer <chave da empresa> (criada em Empresas → Chaves da API).
 * Corpo: um evento ou { "eventos": [...] } (até 100). Ver packages/core/src/sales-source.ts e
 * docs/API-FONTE-DE-VENDAS.md. Resposta 200 com o resultado de cada item.
 */
export async function POST(request: Request) {
  const key = await companyFromApiKey(request.headers.get("authorization"));
  if (!key) return Response.json({ erro: "chave_invalida" }, { status: 401 });
  if (!(await rateLimit(`api-eventos:${key.keyId}`, 600, 60)))
    return Response.json({ erro: "muitas_requisicoes" }, { status: 429, headers: { "Retry-After": "60" } });
  const text = await request.text();
  if (text.length > 512_000) return Response.json({ erro: "corpo_grande_demais" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ erro: "json_invalido" }, { status: 400 });
  }
  const r = await runWithCompany(key.companyId, () => ingestSalesEvents(body, key.isDemo));
  if (!r.ok) return Response.json({ erro: r.error }, { status: 400 });
  return Response.json({ itens: r.itens });
}
