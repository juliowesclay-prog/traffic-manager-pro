/** Política de senha. Equipe administrativa exige senha mais longa (além do MFA). */
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "senha123",
  "senha1234",
  "qwerty123",
  "abcdefgh",
  "11111111",
  "00000000",
  "12341234",
  "prosed123",
  "prosedsaude",
  "mudar123",
  "admin123",
  "iloveyou",
]);

export function validatePassword(
  password: string,
  kind: "member" | "staff",
): { ok: true } | { ok: false; error: string } {
  const min = kind === "staff" ? 12 : 8;
  if (password.length < min) return { ok: false, error: `A senha precisa ter pelo menos ${min} caracteres.` };
  if (password.length > 128) return { ok: false, error: "A senha pode ter no máximo 128 caracteres." };
  if (/^(.)\1+$/.test(password)) return { ok: false, error: "Não use o mesmo caractere repetido." };
  if (COMMON.has(password.toLowerCase()))
    return { ok: false, error: "Essa senha é muito comum. Escolha outra." };
  return { ok: true };
}
