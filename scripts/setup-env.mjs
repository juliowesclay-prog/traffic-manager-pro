// Prepara o ambiente local de forma idempotente:
// - cria .env a partir de .env.example, gerando valores aleatórios para os marcadores
//   (__GERADA__ senha do banco, __CHAVE32__ chave de 32 bytes, __SENHA__ senha forte, __TOTP__ chave do MFA demo);
// - se o .env já existe, só ACRESCENTA as variáveis novas do exemplo (nunca altera as existentes);
// - liga o .env da raiz aos pacotes que o leem (Prisma e Next.js).
import { existsSync, lstatSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const example = readFileSync(path.join(root, ".env.example"), "utf8");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const generators = {
  __CHAVE32__: () => randomBytes(32).toString("base64"),
  __SENHA__: () => randomBytes(18).toString("base64url"),
  __TOTP__: () => [...randomBytes(32)].map((b) => B32[b & 31]).join(""),
};

function fill(line, dbPassword) {
  let out = line.replaceAll("__GERADA__", dbPassword);
  for (const [marker, gen] of Object.entries(generators)) out = out.replaceAll(marker, () => gen());
  return out;
}

if (!existsSync(envPath)) {
  const dbPassword = randomBytes(18).toString("base64url");
  writeFileSync(envPath, example.split("\n").map((l) => fill(l, dbPassword)).join("\n"));
  console.warn("✔ .env criado com segredos aleatórios");
} else {
  const current = readFileSync(envPath, "utf8");
  const existing = new Set(current.split("\n").map((l) => l.split("=")[0]?.trim()).filter(Boolean));
  const dbPassword = /^POSTGRES_PASSWORD=(.*)$/m.exec(current)?.[1] ?? "";
  const missing = example
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l) && !existing.has(l.split("=")[0]))
    .map((l) => fill(l, dbPassword));
  if (missing.length) {
    writeFileSync(envPath, `${current.trimEnd()}\n\n# Acrescentado por pnpm env:init\n${missing.join("\n")}\n`);
    console.warn(`✔ .env: ${missing.length} variáveis novas acrescentadas (${missing.map((l) => l.split("=")[0]).join(", ")})`);
  } else {
    console.warn("• .env já está completo — mantido");
  }
}

for (const target of ["packages/db/.env", "apps/web/.env.local"]) {
  const link = path.join(root, target);
  try {
    if (lstatSync(link)) unlinkSync(link);
  } catch {
    /* não existia */
  }
  symlinkSync(path.relative(path.dirname(link), envPath), link);
  console.warn(`✔ ${target} → .env`);
}
