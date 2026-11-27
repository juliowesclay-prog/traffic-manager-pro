import { describe, expect, it } from "vitest";
import { calculateSavings, formatBRL } from "./money";

describe("formatBRL", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(12345)).toBe("R$ 123,45");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(123456789)).toBe("R$ 1.234.567,89");
  });
  it("recusa valores fracionados ou negativos", () => {
    expect(() => formatBRL(10.5)).toThrow(RangeError);
    expect(() => formatBRL(-1)).toThrow(RangeError);
  });
});

describe("calculateSavings", () => {
  it("calcula economia em reais e percentual", () => {
    expect(calculateSavings(18000, 9900)).toEqual({ amount: 8100, percent: 45 });
  });
  it("arredonda o percentual para baixo", () => {
    // 1/3 = 33,33…% → 33%
    expect(calculateSavings(300, 200)).toEqual({ amount: 100, percent: 33 });
    // 99,9% não vira 100%
    expect(calculateSavings(1000, 1).percent).toBe(99);
  });
  it("recusa preço de associado maior ou igual ao normal", () => {
    expect(() => calculateSavings(100, 100)).toThrow(/menor que o preço normal/);
    expect(() => calculateSavings(100, 150)).toThrow(RangeError);
  });
});

describe("valor com sinal", () => {
  it("resultado negativo aparece com o sinal de menos", async () => {
    const { formatSignedBRL } = await import("./money");
    expect(formatSignedBRL(-123456)).toMatch(/^−R\$\s1\.234,56$/);
    expect(formatSignedBRL(500)).toMatch(/^R\$\s5,00$/);
  });
});
