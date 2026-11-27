import { describe, expect, it } from "vitest";
import {
  costPer,
  intervalLabel,
  META_RESULT_TYPES,
  metaDecimalToCents,
  metaMinorUnits,
  metaSituation,
  pickAction,
  ratio,
  shouldAutoSync,
  syncWindow,
  targetingSummary,
} from "./traffic-sync";

describe("sincronização dos anúncios", () => {
  const now = new Date("2026-11-26T01:30:00Z"); // 25/11 22:30 em Brasília

  it("período no fuso da conta: primeira vez 90 dias, depois 7", () => {
    expect(syncWindow(now, "America/Sao_Paulo", false)).toEqual({ since: "2026-11-19", until: "2026-11-25" });
    expect(syncWindow(now, "America/Sao_Paulo", true).since).toBe("2026-08-28");
    expect(syncWindow(now, "Europe/Lisbon", false).until).toBe("2026-11-26");
    expect(syncWindow(now, "Fuso/Invalido", false).until).toBe("2026-11-25");
  });

  it("automática: respeita o intervalo e conta da última tentativa", () => {
    const ago = (m: number) => new Date(now.getTime() - m * 60_000);
    expect(shouldAutoSync(null, 60, now)).toBe(true);
    expect(shouldAutoSync(ago(59), 60, now)).toBe(false);
    expect(shouldAutoSync(ago(60), 60, now)).toBe(true);
    expect(shouldAutoSync(null, 0, now)).toBe(false);
    expect(intervalLabel(15)).toBe("A cada 15 minutos");
    expect(intervalLabel(180)).toBe("A cada 3 horas");
    expect(intervalLabel(0)).toMatch(/Desligada/);
  });

  it("valores: decimal para centavos e orçamento na menor unidade", () => {
    expect(metaDecimalToCents("123.45")).toBe(12345);
    expect(metaDecimalToCents("0.1")).toBe(10);
    expect(metaDecimalToCents("-5")).toBe(0);
    expect(metaDecimalToCents("abc")).toBe(0);
    expect(metaMinorUnits("5000")).toBe(5000);
    expect(metaMinorUnits("0")).toBeNull();
    expect(metaMinorUnits("50.0")).toBeNull();
  });

  it("resultados sem contar duas vezes", () => {
    const actions = [
      { action_type: "purchase", value: "3" },
      { action_type: "omni_purchase", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
      { action_type: "lead", value: "7" },
    ];
    expect(pickAction(actions, META_RESULT_TYPES.purchases)).toBe("3");
    expect(pickAction(actions, META_RESULT_TYPES.leads)).toBe("7");
    expect(pickAction(actions, META_RESULT_TYPES.conversations)).toBe(0);
    expect(pickAction(undefined, META_RESULT_TYPES.leads)).toBe(0);
  });

  it("situação da campanha", () => {
    const past = new Date("2026-11-01T00:00:00Z");
    const future = new Date("2026-12-01T00:00:00Z");
    expect(metaSituation("ACTIVE", null, null, now)).toBe("ativa");
    expect(metaSituation("ACTIVE", future, null, now)).toBe("ativa");
    expect(metaSituation("ACTIVE", past, null, now)).toBe("encerrada");
    expect(metaSituation("PAUSED", null, null, now)).toBe("pausada");
    expect(metaSituation("CAMPAIGN_PAUSED", null, null, now)).toBe("pausada");
    expect(metaSituation("ARCHIVED", null, null, now)).toBe("encerrada");
    expect(metaSituation("ACTIVE", null, past, now)).toBe("encerrada");
    expect(metaSituation("PENDING_REVIEW", null, null, now)).toBe("analise");
    expect(metaSituation("DISAPPROVED", null, null, now)).toBe("problema");
  });

  it("taxas e público", () => {
    expect(ratio(15, 1000)).toBe(1.5);
    expect(ratio(1, 0)).toBeNull();
    expect(costPer(1000, 3)).toBe(333);
    expect(costPer(1000, 0)).toBeNull();
    expect(
      targetingSummary({
        age_min: 25,
        age_max: 65,
        genders: [2],
        geo_locations: { cities: [{ name: "Londrina" }] },
      }),
    ).toBe("25–65+ anos · mulheres · Londrina");
    expect(targetingSummary(null)).toBeNull();
  });
});
