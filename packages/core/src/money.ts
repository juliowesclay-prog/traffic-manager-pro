/** Valores monetários são sempre inteiros em centavos — nunca float. */
export type Cents = number;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function assertCents(value: Cents, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} deve ser um inteiro em centavos, maior ou igual a zero`);
  }
}

/** 12345 → "R$ 123,45" (com espaço comum, para leitores de tela e testes). */
export function formatBRL(cents: Cents): string {
  assertCents(cents, "valor");
  return brl.format(cents / 100).replace(/[\u00a0\u202f]/g, " ");
}

export interface Savings {
  /** Economia em centavos. */
  amount: Cents;
  /** Percentual inteiro, arredondado para baixo (nunca promete mais do que o real). */
  percent: number;
}

/**
 * Economia do associado em relação ao preço normal. A economia é sempre calculada, nunca digitada.
 * Lança erro se o preço do associado não for menor que o preço normal (oferta inválida).
 */
export function calculateSavings(regularPrice: Cents, memberPrice: Cents): Savings {
  assertCents(regularPrice, "preço normal");
  assertCents(memberPrice, "preço do associado");
  if (memberPrice >= regularPrice) {
    throw new RangeError("O preço do associado deve ser menor que o preço normal");
  }
  const amount = regularPrice - memberPrice;
  return { amount, percent: Math.floor((amount * 100) / regularPrice) };
}

/** Maior preço aceito num cadastro (R$ 100.000,00) — evita erro de digitação virar preço publicado. */
export const MAX_PRICE_CENTS = 10_000_000;

/**
 * Lê um valor digitado em reais e devolve centavos inteiros (ou null se não for um valor válido).
 * Aceita "180", "180,5", "R$ 1.234,56", "99,90", "12.50" e "1.234" (milhar). No máximo 2 casas decimais.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    const [int, dec] = s.split(",") as [string, string];
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(int)) return null;
    s = `${int.replace(/\./g, "")}.${dec}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 12345 → "123,45" (para preencher campos de formulário). */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Valor que pode ser negativo (resultado, saldo): "−R$ 1.234,56". */
export function formatSignedBRL(cents: Cents): string {
  return cents < 0 ? `−${formatBRL(-cents)}` : formatBRL(cents);
}
