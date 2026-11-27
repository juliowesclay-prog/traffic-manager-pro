/**
 * Origem do visitante (entrega 8.3): lê utm_* e fbclid do endereço de entrada e guarda num cookie
 * próprio (último clique, 30 dias). Sem dependências: roda no middleware. Valores são limpos e
 * limitados — o cookie é do visitante e pode ser alterado por ele, então nada aqui é confiável
 * para segurança, só para estatística.
 */

export const ATTRIBUTION_COOKIE = "prosed_origem";
export const ATTRIBUTION_DAYS = 30;

/** Parâmetros a colar no campo "Parâmetros de URL" dos anúncios da Meta. */
export const META_URL_PARAMS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}";

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  fbclid: string | null;
  landingPath: string | null;
  /** ms */
  clickedAt: number;
}

const KEYS = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
} as const;

/** Texto curto, sem caracteres de controle; letras com acento são aceitas. */
function clean(v: string | null, max = 120): string | null {
  if (!v) return null;
  const t = v
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} _.:|+{}()/-]/gu, "")
    .trim()
    .slice(0, max);
  return t || null;
}
const cleanFbclid = (v: string | null) => (v && /^[A-Za-z0-9_-]{10,500}$/.test(v) ? v : null);
const cleanPath = (p: string) => (/^\/[\w\-/]{0,200}$/.test(p) ? p : "/");

/** Endereço de entrada → origem (ou null se não veio de link marcado). */
export function attributionFromUrl(url: URL, now: number): Attribution | null {
  const q = url.searchParams;
  const a: Attribution = {
    source: clean(q.get("utm_source")),
    medium: clean(q.get("utm_medium")),
    campaign: clean(q.get("utm_campaign")),
    term: clean(q.get("utm_term")),
    content: clean(q.get("utm_content")),
    fbclid: cleanFbclid(q.get("fbclid")),
    landingPath: cleanPath(url.pathname),
    clickedAt: now,
  };
  if (!a.source && !a.campaign && !a.fbclid) return null;
  // Veio com fbclid mas sem utm (link sem os parâmetros): é da Meta.
  if (!a.source && a.fbclid) a.source = "facebook";
  return a;
}

export function serializeAttribution(a: Attribution): string {
  const p = new URLSearchParams();
  for (const [k, field] of Object.entries(KEYS)) {
    const v = a[field];
    if (v) p.set(k, v);
  }
  if (a.fbclid) p.set("fbclid", a.fbclid);
  if (a.landingPath) p.set("p", a.landingPath);
  p.set("t", String(a.clickedAt));
  return p.toString();
}

/** Lê o cookie de volta (limpando de novo); vencido, inválido ou do futuro → null. */
export function parseAttribution(raw: string | undefined | null, now: number): Attribution | null {
  if (!raw || raw.length > 2000) return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const t = Number(q.get("t"));
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > ATTRIBUTION_DAYS * 86_400_000) return null;
  const a: Attribution = {
    source: clean(q.get("utm_source")),
    medium: clean(q.get("utm_medium")),
    campaign: clean(q.get("utm_campaign")),
    term: clean(q.get("utm_term")),
    content: clean(q.get("utm_content")),
    fbclid: cleanFbclid(q.get("fbclid")),
    landingPath: q.get("p") ? cleanPath(q.get("p")!) : null,
    clickedAt: t,
  };
  return a.source || a.campaign || a.fbclid ? a : null;
}

/** IDs numéricos da Meta (quando o anúncio usa {{campaign.id}} etc.). */
const metaId = (v: string | null) => (v && /^\d{6,30}$/.test(v) ? v : null);
export function metaIdsOf(a: Attribution) {
  return {
    campaignExternalId: metaId(a.campaign),
    adSetExternalId: metaId(a.term),
    adExternalId: metaId(a.content),
  };
}

/** É tráfego da Meta (Facebook/Instagram)? */
export const isMetaSource = (source: string | null) =>
  !!source && /^(facebook|fb|instagram|ig|meta)$/i.test(source.trim());
