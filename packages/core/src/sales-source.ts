import { attributionFromUrl, metaIdsOf, type Attribution } from "./attribution";

/**
 * Fonte de vendas: qualquer sistema (site, loja, CRM, Prosed+ Saúde...) avisa o Traffic Manager Pro
 * de CADASTROS (leads), VENDAS e ESTORNOS pela API. Aqui fica a validação pura do que chega.
 *
 * Exemplo de cadastro:
 *   { "tipo": "cadastro", "id": "cliente-123", "quando": "2026-11-26T10:00:00-03:00",
 *     "origem": "https://site.com.br/assinar?utm_source=facebook&utm_campaign=120200000001&fbclid=...",
 *     "clicado_em": "2026-11-26T09:58:00-03:00" }
 * Exemplo de venda:
 *   { "tipo": "venda", "id": "pedido-987", "cliente": "cliente-123", "valor": 49.9,
 *     "primeira": true, "quando": "2026-11-26T10:05:00-03:00" }
 * Exemplo de estorno:
 *   { "tipo": "estorno", "id": "pedido-987", "quando": "2026-11-28T08:00:00-03:00" }
 *
 * Nunca recebemos dados pessoais (nome, CPF, telefone, e-mail): o "id" é o código do cliente no
 * sistema de origem.
 */

export const SALES_SOURCE_LIMITS = { maxBatch: 100, maxIdLength: 100, maxValueCents: 100_000_000 } as const;

export type SalesEvent =
  | {
      kind: "LEAD";
      externalId: string;
      at: Date;
      attribution: (Attribution & ReturnType<typeof metaIdsOf>) | null;
      /** Endereço de entrada sem os parâmetros (vai para a API de Conversões). */
      landingUrl: string | null;
    }
  | { kind: "SALE"; externalId: string; leadExternalId: string; at: Date; valueCents: number; first: boolean }
  | { kind: "REFUND"; externalId: string; at: Date };

export type ParseResult = { ok: true; event: SalesEvent } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_.:@-]+$/;
const asId = (v: unknown) =>
  typeof v === "string" && v.length >= 1 && v.length <= SALES_SOURCE_LIMITS.maxIdLength && ID.test(v)
    ? v
    : null;

/** Data ISO; não aceita futuro (mais de 5 min) nem mais de 400 dias atrás. */
function asDate(v: unknown, now: Date): Date | null {
  if (v === undefined || v === null) return now;
  if (typeof v !== "string" || v.length > 40) return null;
  const d = new Date(v);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (t > now.getTime() + 5 * 60_000 || t < now.getTime() - 400 * 86_400_000) return null;
  return d;
}

/** Valor em reais (número, até 2 casas) → centavos. */
function asCents(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  const cents = Math.round(v * 100);
  if (Math.abs(cents - v * 100) > 0.001 || cents > SALES_SOURCE_LIMITS.maxValueCents) return null;
  return cents;
}

export function parseSalesEvent(input: unknown, now = new Date()): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "Evento precisa ser um objeto." };
  const e = input as Record<string, unknown>;
  const externalId = asId(e.id);
  if (!externalId) return { ok: false, error: "Campo 'id' inválido (letras, números e _.:@-, até 100)." };
  const at = asDate(e.quando, now);
  if (!at) return { ok: false, error: "Campo 'quando' inválido (data ISO, não futura, até 400 dias)." };

  switch (e.tipo) {
    case "cadastro": {
      let attribution: Extract<SalesEvent, { kind: "LEAD" }>["attribution"] = null;
      let landingUrl: string | null = null;
      if (e.origem !== undefined && e.origem !== null) {
        if (typeof e.origem !== "string" || e.origem.length > 2000)
          return { ok: false, error: "Campo 'origem' deve ser o endereço (URL) de entrada." };
        let url: URL;
        try {
          url = new URL(e.origem);
        } catch {
          return { ok: false, error: "Campo 'origem' deve ser o endereço (URL) de entrada." };
        }
        const clickedAt = asDate(e.clicado_em, at);
        if (!clickedAt) return { ok: false, error: "Campo 'clicado_em' inválido." };
        if (clickedAt.getTime() > at.getTime() + 60_000)
          return { ok: false, error: "'clicado_em' não pode ser depois do cadastro." };
        if (url.protocol !== "https:" && url.protocol !== "http:")
          return { ok: false, error: "Campo 'origem' deve ser o endereço (URL) de entrada." };
        landingUrl = `${url.origin}${url.pathname}`.slice(0, 500);
        const a = attributionFromUrl(url, clickedAt.getTime());
        attribution = a ? { ...a, ...metaIdsOf(a) } : null;
      }
      return { ok: true, event: { kind: "LEAD", externalId, at, attribution, landingUrl } };
    }
    case "venda": {
      const leadExternalId = asId(e.cliente);
      if (!leadExternalId) return { ok: false, error: "Campo 'cliente' (id do cadastro) inválido." };
      const valueCents = asCents(e.valor);
      if (valueCents === null) return { ok: false, error: "Campo 'valor' inválido (reais, ex.: 49.9)." };
      if (e.primeira !== undefined && typeof e.primeira !== "boolean")
        return { ok: false, error: "Campo 'primeira' deve ser true ou false." };
      return {
        ok: true,
        event: { kind: "SALE", externalId, leadExternalId, at, valueCents, first: e.primeira !== false },
      };
    }
    case "estorno":
      return { ok: true, event: { kind: "REFUND", externalId, at } };
    default:
      return { ok: false, error: "Campo 'tipo' deve ser cadastro, venda ou estorno." };
  }
}

/** Aceita um evento ou { "eventos": [...] } com até 100. */
export function parseSalesBatch(
  body: unknown,
  now = new Date(),
): { ok: true; results: ParseResult[] } | { ok: false; error: string } {
  const list =
    body && typeof body === "object" && !Array.isArray(body) && "eventos" in body
      ? (body as { eventos: unknown }).eventos
      : [body];
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Nenhum evento enviado." };
  if (list.length > SALES_SOURCE_LIMITS.maxBatch)
    return { ok: false, error: `No máximo ${SALES_SOURCE_LIMITS.maxBatch} eventos por envio.` };
  return { ok: true, results: list.map((e) => parseSalesEvent(e, now)) };
}

/** Chave da API: prefixo visível + segredo. Só o hash fica no banco. */
export const API_KEY_PREFIX = "tmp_";
export const isApiKeyFormat = (v: string) => /^tmp_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32,64}$/.test(v);
