import { describe, expect, it } from "vitest";
import { isApiKeyFormat, parseSalesBatch, parseSalesEvent } from "./sales-source";

const now = new Date("2026-11-26T15:00:00Z");

describe("fonte de vendas: cadastro", () => {
  it("lê a origem do anúncio da Meta pelo endereço de entrada", () => {
    const r = parseSalesEvent(
      {
        tipo: "cadastro",
        id: "cliente-123",
        quando: "2026-11-26T10:00:00-03:00",
        origem:
          "https://site.com.br/assinar?utm_source=facebook&utm_medium=paid&utm_campaign=120200000001&utm_term=120200000002&utm_content=120200000003&fbclid=IwAR0abcdefghij",
        clicado_em: "2026-11-26T09:58:00-03:00",
      },
      now,
    );
    expect(r.ok).toBe(true);
    if (!r.ok || r.event.kind !== "LEAD") throw new Error();
    expect(r.event.attribution).toMatchObject({
      source: "facebook",
      campaignExternalId: "120200000001",
      adSetExternalId: "120200000002",
      adExternalId: "120200000003",
      fbclid: "IwAR0abcdefghij",
      landingPath: "/assinar",
    });
    expect(r.event.landingUrl).toBe("https://site.com.br/assinar");
    expect(r.event.attribution?.clickedAt).toBe(new Date("2026-11-26T12:58:00Z").getTime());
  });
  it("sem origem ou com link sem marcação: cadastro sem origem", () => {
    const a = parseSalesEvent({ tipo: "cadastro", id: "c1" }, now);
    const b = parseSalesEvent({ tipo: "cadastro", id: "c2", origem: "https://site.com.br/" }, now);
    expect(a.ok && a.event.kind === "LEAD" && a.event.attribution).toBe(null);
    expect(b.ok && b.event.kind === "LEAD" && b.event.attribution).toBe(null);
    expect(a.ok && a.event.at).toEqual(now);
  });
  it("recusa id, data e origem inválidos", () => {
    expect(parseSalesEvent({ tipo: "cadastro", id: "com espaço" }, now).ok).toBe(false);
    expect(parseSalesEvent({ tipo: "cadastro", id: "x".repeat(101) }, now).ok).toBe(false);
    expect(parseSalesEvent({ tipo: "cadastro", id: "c", quando: "2027-01-01T00:00:00Z" }, now).ok).toBe(false);
    expect(parseSalesEvent({ tipo: "cadastro", id: "c", quando: "ontem" }, now).ok).toBe(false);
    expect(parseSalesEvent({ tipo: "cadastro", id: "c", origem: "não é url" }, now).ok).toBe(false);
    expect(
      parseSalesEvent(
        {
          tipo: "cadastro",
          id: "c",
          quando: "2026-11-26T10:00:00Z",
          origem: "https://s.com/?fbclid=IwAR0abcdefghij",
          clicado_em: "2026-11-26T11:00:00Z",
        },
        now,
      ).ok,
    ).toBe(false);
  });
});

describe("fonte de vendas: venda e estorno", () => {
  it("venda em reais vira centavos; primeira por padrão", () => {
    const r = parseSalesEvent({ tipo: "venda", id: "p-1", cliente: "cliente-123", valor: 49.9 }, now);
    expect(r).toEqual({
      ok: true,
      event: { kind: "SALE", externalId: "p-1", leadExternalId: "cliente-123", at: now, valueCents: 4990, first: true },
    });
    const rec = parseSalesEvent({ tipo: "venda", id: "p-2", cliente: "c", valor: 10, primeira: false }, now);
    expect(rec.ok && rec.event.kind === "SALE" && rec.event.first).toBe(false);
  });
  it("recusa valor inválido e venda sem cliente", () => {
    for (const valor of [-1, "49,90", 1.234, Number.NaN, 2_000_000])
      expect(parseSalesEvent({ tipo: "venda", id: "p", cliente: "c", valor }, now).ok, String(valor)).toBe(false);
    expect(parseSalesEvent({ tipo: "venda", id: "p", valor: 10 }, now).ok).toBe(false);
  });
  it("estorno só precisa do id da venda", () => {
    expect(parseSalesEvent({ tipo: "estorno", id: "p-1" }, now)).toEqual({
      ok: true,
      event: { kind: "REFUND", externalId: "p-1", at: now },
    });
  });
  it("tipo desconhecido é recusado", () => {
    expect(parseSalesEvent({ tipo: "pix", id: "p" }, now).ok).toBe(false);
    expect(parseSalesEvent(null, now).ok).toBe(false);
  });
});

describe("fonte de vendas: lote e chave", () => {
  it("aceita um evento ou lote de até 100", () => {
    const one = parseSalesBatch({ tipo: "cadastro", id: "c" }, now);
    expect(one.ok && one.results).toHaveLength(1);
    const many = parseSalesBatch({ eventos: [{ tipo: "cadastro", id: "a" }, { tipo: "x", id: "b" }] }, now);
    expect(many.ok && many.results.map((r) => r.ok)).toEqual([true, false]);
    expect(parseSalesBatch({ eventos: [] }, now).ok).toBe(false);
    expect(parseSalesBatch({ eventos: Array(101).fill({ tipo: "cadastro", id: "a" }) }, now).ok).toBe(false);
  });
  it("formato da chave", () => {
    expect(isApiKeyFormat("tmp_abcd1234_" + "x".repeat(43))).toBe(true);
    expect(isApiKeyFormat("tmp_abc_" + "x".repeat(43))).toBe(false);
    expect(isApiKeyFormat("sk_abcd1234_" + "x".repeat(43))).toBe(false);
  });
});
