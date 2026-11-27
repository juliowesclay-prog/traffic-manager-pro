import { describe, expect, it } from "vitest";
import {
  buildCapiEvent,
  buildFbc,
  capiEventId,
  capiRetryAt,
  normalizeCapiSettings,
  withinCapiWindow,
} from "./traffic-capi";

const HASH = "a".repeat(64);

describe("API de Conversões", () => {
  it("fbc no formato da Meta; fbclid inválido não vira fbc", () => {
    const at = new Date("2026-11-20T10:00:00Z");
    expect(buildFbc("IwAR123abc_XYZ", at)).toBe(`fb.1.${at.getTime()}.IwAR123abc_XYZ`);
    expect(buildFbc(null, at)).toBeNull();
    expect(buildFbc("curto", at)).toBeNull();
    expect(buildFbc("tem espaço e <script>", at)).toBeNull();
  });

  it("prazo de 7 dias da Meta", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    expect(withinCapiWindow(new Date("2026-11-20T12:00:00Z"), now)).toBe(true);
    expect(withinCapiWindow(new Date("2026-11-19T12:00:00Z"), now)).toBe(false);
    expect(withinCapiWindow(new Date("2026-11-27T12:00:00Z"), now)).toBe(false);
  });

  it("novas tentativas espaçadas e com limite", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    expect(capiRetryAt(1, now)?.getTime()).toBe(now.getTime() + 60_000);
    expect(capiRetryAt(3, now)?.getTime()).toBe(now.getTime() + 16 * 60_000);
    expect(capiRetryAt(5, now)).toBeNull();
  });

  it("venda leva valor em reais; cadastro não; só dados com hash", () => {
    const base = {
      eventTime: new Date("2026-11-26T12:00:00Z"),
      sourceUrl: "https://prosed.com.br/",
      fbc: "fb.1.1.IwAR123abc_XYZ",
      externalIdHash: HASH,
    };
    const venda = buildCapiEvent({
      ...base,
      kind: "VENDA",
      eventId: capiEventId("VENDA", "x"),
      valueCents: 3990,
    });
    expect(venda).toMatchObject({
      event_name: "Purchase",
      event_id: "venda_x",
      action_source: "website",
      custom_data: { currency: "BRL", value: 39.9 },
      user_data: { fbc: base.fbc, external_id: [HASH] },
    });
    const cad = buildCapiEvent({ ...base, kind: "CADASTRO", eventId: "cad_x", valueCents: null });
    expect(cad.event_name).toBe("CompleteRegistration");
    expect(cad).not.toHaveProperty("custom_data");
    expect(Object.keys(cad.user_data).sort()).toEqual(["external_id", "fbc"]);
    expect(() =>
      buildCapiEvent({
        ...base,
        kind: "CADASTRO",
        eventId: "c",
        valueCents: null,
        externalIdHash: "membro-1",
      }),
    ).toThrow();
  });

  it("configuração: sem conjunto de dados fica desligada", () => {
    expect(normalizeCapiSettings({ enabled: true })).toEqual({
      enabled: false,
      datasetId: null,
      testEventCode: null,
    });
    expect(
      normalizeCapiSettings({ enabled: true, datasetId: "1234567890", testEventCode: "TEST123" }),
    ).toEqual({
      enabled: true,
      datasetId: "1234567890",
      testEventCode: "TEST123",
    });
    expect(normalizeCapiSettings({ enabled: true, datasetId: "abc", testEventCode: "x y" }).enabled).toBe(
      false,
    );
  });
});
