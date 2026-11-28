import { describe, expect, it } from "vitest";
import {
  addNumbers,
  byKind,
  EMPTY_NUMBERS,
  performanceReading,
  rankCreatives,
  rates,
  type CreativePerf,
} from "./creative-performance";

const perf = (id: string, kind: CreativePerf["kind"], n: Partial<typeof EMPTY_NUMBERS>): CreativePerf => ({
  id,
  name: id,
  kind,
  ads: 1,
  numbers: addNumbers(EMPTY_NUMBERS, n),
});

describe("desempenho dos criativos", () => {
  it("taxas: CTR, CPC, custo por cadastro e por venda, retorno", () => {
    expect(
      rates(
        addNumbers(EMPTY_NUMBERS, {
          spend: 10_000,
          impressions: 5000,
          linkClicks: 100,
          leads: 4,
          sales: 2,
          revenue: 30_000,
        }),
      ),
    ).toEqual({
      ctr: 2,
      cpc: 100,
      cpl: 2500,
      cac: 5000,
      roas: 3,
    });
    expect(rates(EMPTY_NUMBERS)).toEqual({ ctr: null, cpc: null, cpl: null, cac: null, roas: null });
  });

  it("ranking: vendas reais primeiro, depois menor custo por venda", () => {
    const r = rankCreatives([
      perf("a", "IMAGEM", { spend: 1000, leads: 9 }),
      perf("b", "VIDEO", { spend: 9000, sales: 2 }),
      perf("c", "CARROSSEL", { spend: 3000, sales: 2 }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("leitura sempre cita o período e aponta gasto sem resultado", () => {
    const lines = performanceReading(
      [perf("x", "IMAGEM", { spend: 8000, impressions: 2000 })],
      "Nos últimos 7 dias",
    );
    expect(lines[0]).toMatch(/^Nos últimos 7 dias, 1 criativo/);
    expect(lines.join(" ")).toContain("sem cadastro nem venda");
    expect(performanceReading([], "Nos últimos 30 dias")[0]).toContain("Nos últimos 30 dias");
  });

  it("soma por tipo", () => {
    const k = byKind([
      perf("a", "IMAGEM", { spend: 1 }),
      perf("b", "IMAGEM", { spend: 2 }),
      perf("c", "VIDEO", { spend: 5 }),
    ]);
    expect(k.find((x) => x.kind === "IMAGEM")).toMatchObject({ creatives: 2, numbers: { spend: 3 } });
  });
});
