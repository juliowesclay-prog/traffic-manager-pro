import { describe, expect, it } from "vitest";
import { prefillLoginAllowed, productionConfigProblems } from "./config-check";

const k = (c: string) => btoa(c.repeat(32));
const ok = {
  APP_ENV: "production",
  APP_URL: "https://trafficmanager.pro",
  DATA_ENCRYPTION_KEY: k("a"),
  HASH_PEPPER: k("b"),
  CRON_SECRET: "x".repeat(40),
  TRUST_PROXY_HOPS: "1",
};

describe("configuração de produção", () => {
  it("fora de produção não confere nada", () => {
    expect(productionConfigProblems({ APP_ENV: "development" })).toEqual([]);
  });
  it("configuração completa passa", () => {
    expect(productionConfigProblems(ok)).toEqual([]);
  });
  it("aponta cada problema sem mostrar valores", () => {
    const p = productionConfigProblems({
      ...ok,
      APP_URL: "http://site",
      HASH_PEPPER: ok.DATA_ENCRYPTION_KEY,
      CRON_SECRET: "s3gr3d0",
      TRUST_PROXY_HOPS: "0",
    });
    expect(p).toHaveLength(4);
    expect(p.join(" ")).not.toContain("s3gr3d0");
    expect(p.some((x) => x.startsWith("TRUST_PROXY_HOPS=0"))).toBe(true);
  });
  it("proxy zero só com declaração explícita; chave curta recusada", () => {
    expect(productionConfigProblems({ ...ok, TRUST_PROXY_HOPS: "0", TRUST_PROXY_NONE: "true" })).toEqual([]);
    expect(productionConfigProblems({ ...ok, DATA_ENCRYPTION_KEY: btoa("curta") })).toEqual([
      "DATA_ENCRYPTION_KEY deve ter 32 bytes em base64.",
    ]);
  });
});

describe("Gestor de Tráfego na produção", () => {
  it("IA analista: simulada recusada; Claude exige a chave", () => {
    expect(productionConfigProblems({ ...ok, AI_PROVIDER: "simulado" })).toEqual([
      "AI_PROVIDER=simulado é só para desenvolvimento.",
    ]);
    expect(productionConfigProblems({ ...ok, AI_PROVIDER: "claude" })).toEqual([
      "ANTHROPIC_API_KEY não configurada (chave da API do Claude).",
    ]);
    expect(
      productionConfigProblems({ ...ok, AI_PROVIDER: "claude", ANTHROPIC_API_KEY: "sk-ant-api03-teste" }),
    ).toEqual([]);
  });

  it("simulado recusado; Meta real exige app e segredo", () => {
    expect(productionConfigProblems({ ...ok, META_PROVIDER: "simulado" })).toEqual([
      "META_PROVIDER=simulado é só para desenvolvimento.",
    ]);
    expect(productionConfigProblems({ ...ok, META_PROVIDER: "meta" })).toEqual([
      "META_APP_ID não configurado.",
      "META_APP_SECRET não configurado.",
    ]);
    expect(
      productionConfigProblems({
        ...ok,
        META_PROVIDER: "meta",
        META_APP_ID: "1234567890",
        META_APP_SECRET: "s".repeat(32),
      }),
    ).toEqual([]);
  });
});

describe("login do administrador preenchido em teste", () => {
  const dev = { APP_ENV: "development", DEV_PREFILL_LOGIN: "true" };
  it("só no próprio computador, ligado e fora de produção", () => {
    for (const h of ["localhost:3200", "localhost", "127.0.0.1:3201", "[::1]:3200"])
      expect(prefillLoginAllowed(dev, h), h).toBe(true);
    for (const h of [
      "192.168.18.38:3200",
      "trafficmanager.pro",
      "localhost.evil.com",
      "evil.com:3200",
      "",
      null,
    ])
      expect(prefillLoginAllowed(dev, h), String(h)).toBe(false);
    expect(prefillLoginAllowed({ ...dev, APP_ENV: "production" }, "localhost")).toBe(false);
    expect(prefillLoginAllowed({ APP_ENV: "development" }, "localhost")).toBe(false);
  });
  it("produção recusa subir com a opção configurada", () => {
    expect(productionConfigProblems({ ...ok, DEV_PREFILL_LOGIN: "true" })).toEqual([
      "DEV_PREFILL_LOGIN (login de teste preenchido) não pode existir em produção: apague a variável.",
    ]);
  });
});
