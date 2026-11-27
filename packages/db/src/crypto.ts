import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Proteção de dados pessoais em repouso (LGPD):
 * - encrypt/decrypt: AES-256-GCM (CPF, telefone, segredo do MFA). Formato "v1.<iv>.<tag>.<dados>" em base64url.
 * - blindIndex: HMAC-SHA256 com pepper, para buscar/impedir duplicidade sem guardar o valor em claro.
 * As chaves ficam só no servidor (.env / cofre de segredos) e nunca no banco.
 */

function key(name: "DATA_ENCRYPTION_KEY" | "HASH_PEPPER"): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} não configurada (rode pnpm env:init em desenvolvimento)`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${name} deve ter 32 bytes em base64`);
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("DATA_ENCRYPTION_KEY"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key("DATA_ENCRYPTION_KEY"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Índice cego determinístico. `scope` separa domínios (cpf, phone…) para que hashes não se cruzem. */
export function blindIndex(scope: string, value: string): string {
  return createHmac("sha256", key("HASH_PEPPER")).update(`${scope}:${value}`).digest("base64url");
}
