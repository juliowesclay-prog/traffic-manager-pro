/** Regras de validação de dados pessoais do cadastro (mensagens em linguagem simples). */

export const MIN_AGE = 18;
export const MAX_AGE = 120;

/** Nome completo: pelo menos nome e sobrenome, só letras, espaços, apóstrofo e hífen. */
export function validateFullName(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 5 || value.split(" ").length < 2) {
    return { ok: false, error: "Digite seu nome e sobrenome." };
  }
  if (value.length > 120) return { ok: false, error: "O nome está muito longo." };
  if (!/^[\p{L}][\p{L}' -]*[\p{L}]$/u.test(value)) {
    return { ok: false, error: "Use apenas letras no nome." };
  }
  return { ok: true, value };
}

/** Primeiro nome com só a inicial maiúscula ("MARIA da silva" → "Maria"). */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

/** Idade completa em anos numa data de referência. Datas no formato AAAA-MM-DD. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

/** Valida data de nascimento (AAAA-MM-DD): data real, maior de 18 anos e idade plausível. */
export function validateBirthDate(
  input: string,
  today: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return { ok: false, error: "Informe a data de nascimento completa." };
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: "Essa data não existe. Confira o dia e o mês." };
  }
  const age = ageOn(input.trim(), today);
  if (age < 0 || age > MAX_AGE) return { ok: false, error: "Confira o ano de nascimento." };
  if (age < MIN_AGE) return { ok: false, error: "A adesão é permitida a partir de 18 anos." };
  return { ok: true, value: input.trim() };
}

/** E-mail opcional: normaliza para minúsculas; vazio vira null. */
export function normalizeEmail(input: string | null | undefined): string | null | "invalid" {
  const value = (input ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "invalid";
  return value;
}

/** Número de associado exibido na carteirinha: 123 → "PS-000123". */
export function formatMemberNumber(seq: number): string {
  return `PS-${String(seq).padStart(6, "0")}`;
}
