import { describe, expect, it } from "vitest";
import {
  attributionFromUrl,
  isMetaSource,
  META_URL_PARAMS,
  metaIdsOf,
  parseAttribution,
  serializeAttribution,
} from "./attribution";

const now = Date.parse("2026-11-26T12:00:00Z");
const url = (q: string, path = "/planos") => new URL(`https://prosed.test${path}?${q}`);

describe("origem do cadastro (utm e fbclid)", () => {
  it("lê os parâmetros do anúncio da Meta, com IDs", () => {
    const a = attributionFromUrl(
      url(
        "utm_source=facebook&utm_medium=paid&utm_campaign=2380000000000001&utm_term=2381000000000000&utm_content=2382000000000000&fbclid=IwAR0abcDEF_123-xyz",
      ),
      now,
    )!;
    expect(a).toMatchObject({
      source: "facebook",
      medium: "paid",
      landingPath: "/planos",
      fbclid: "IwAR0abcDEF_123-xyz",
    });
    expect(metaIdsOf(a)).toEqual({
      campaignExternalId: "2380000000000001",
      adSetExternalId: "2381000000000000",
      adExternalId: "2382000000000000",
    });
  });

  it("sem parâmetros de marketing não grava nada; só fbclid vira facebook", () => {
    expect(attributionFromUrl(url("q=consulta"), now)).toBeNull();
    expect(attributionFromUrl(url("fbclid=IwAR0abcdefghij"), now)?.source).toBe("facebook");
  });

  it("limpa valores (acentos sim, código não) e limita tamanho", () => {
    const a = attributionFromUrl(
      url(`utm_source=google&utm_campaign=${encodeURIComponent("Promoção <script>alert(1)</script>")}`),
      now,
    )!;
    expect(a.campaign).toBe("Promoção scriptalert(1)/script");
    expect(attributionFromUrl(url(`utm_source=${"x".repeat(500)}`), now)!.source).toHaveLength(120);
    expect(attributionFromUrl(url("fbclid=<x>"), now)).toBeNull();
    expect(
      metaIdsOf(attributionFromUrl(url("utm_source=facebook&utm_campaign=black-friday"), now)!)
        .campaignExternalId,
    ).toBeNull();
  });

  it("vai e volta pelo cookie; vencido, do futuro ou estragado é ignorado", () => {
    const a = attributionFromUrl(
      url("utm_source=facebook&utm_campaign=2380000000000001&fbclid=IwAR0abcdefghij"),
      now,
    )!;
    expect(parseAttribution(serializeAttribution(a), now + 86_400_000)).toEqual(a);
    expect(parseAttribution(serializeAttribution(a), now + 31 * 86_400_000)).toBeNull();
    expect(parseAttribution(serializeAttribution({ ...a, clickedAt: now + 3_600_000 }), now)).toBeNull();
    expect(parseAttribution("t=abc&utm_source=facebook", now)).toBeNull();
    expect(
      parseAttribution(`t=${now}&utm_source=${encodeURIComponent("fb'; DROP TABLE")}`, now)?.source,
    ).toBe("fb DROP TABLE");
    expect(parseAttribution(undefined, now)).toBeNull();
  });

  it("fonte da Meta e parâmetros sugeridos", () => {
    expect(isMetaSource("facebook")).toBe(true);
    expect(isMetaSource("Instagram")).toBe(true);
    expect(isMetaSource("google")).toBe(false);
    expect(META_URL_PARAMS).toContain("utm_content={{ad.id}}");
  });
});
