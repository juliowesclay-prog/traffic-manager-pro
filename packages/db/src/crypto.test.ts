import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { blindIndex, decrypt, encrypt } from "./crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.HASH_PEPPER = randomBytes(32).toString("base64");
});

describe("proteção de dados", () => {
  it("cifra e decifra; o texto cifrado não contém o valor e muda a cada vez", () => {
    const a = encrypt("52998224725");
    const b = encrypt("52998224725");
    expect(a).not.toContain("52998224725");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("52998224725");
  });
  it("detecta adulteração", () => {
    const parts = encrypt("segredo").split(".");
    parts[3] = Buffer.from("outra coisa").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("índice cego é determinístico e separado por escopo", () => {
    expect(blindIndex("cpf", "1")).toBe(blindIndex("cpf", "1"));
    expect(blindIndex("cpf", "1")).not.toBe(blindIndex("phone", "1"));
  });
  it("falha com chave ausente ou de tamanho errado", () => {
    const old = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = Buffer.from("curta").toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
    process.env.DATA_ENCRYPTION_KEY = old;
  });
});
