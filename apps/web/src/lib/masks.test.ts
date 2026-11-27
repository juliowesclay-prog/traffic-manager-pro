import { describe, expect, it } from "vitest";
import { maskCpfInput, maskDateInput, maskPhoneInput } from "./masks";

describe("máscaras de digitação", () => {
  it("CPF", () => {
    expect(maskCpfInput("529")).toBe("529");
    expect(maskCpfInput("5299822")).toBe("529.982.2");
    expect(maskCpfInput("52998224725")).toBe("529.982.247-25");
    expect(maskCpfInput("529.982.247-25999")).toBe("529.982.247-25");
  });
  it("celular", () => {
    expect(maskPhoneInput("43")).toBe("(43");
    expect(maskPhoneInput("4399")).toBe("(43) 99");
    expect(maskPhoneInput("43999990000")).toBe("(43) 99999-0000");
    expect(maskPhoneInput("+55 43 99999-0000")).toBe("(43) 99999-0000");
  });
  it("data", () => {
    expect(maskDateInput("2503")).toBe("25/03");
    expect(maskDateInput("25031960")).toBe("25/03/1960");
  });
});
