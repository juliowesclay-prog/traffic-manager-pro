import { describe, expect, it } from "vitest";
import { formatBRL } from "./money";
import { periodChange, trafficAlerts, type AlertCampaign, type AlertInput } from "./traffic-alerts";

const camp = (p: Partial<AlertCampaign>): AlertCampaign => ({
  id: "c1",
  name: "Vendas",
  spend: 0,
  sales: 0,
  impressions: 0,
  linkClicks: 0,
  effectiveStatus: "ACTIVE",
  lifetimeBudget: null,
  budgetRemaining: null,
  prevSpend: 0,
  prevSales: 0,
  ...p,
});
const base = (p: Partial<AlertInput> = {}): AlertInput => ({
  campaigns: [],
  ads: [],
  averageCac: null,
  minutesSinceSync: 10,
  syncIntervalMinutes: 60,
  tokenDaysLeft: 50,
  withoutIds: 0,
  formatMoney: formatBRL,
  ...p,
});
const ids = (i: AlertInput) => trafficAlerts(i).map((a) => a.id);

describe("alertas do gestor de tráfego", () => {
  it("tudo em ordem: nenhum alerta", () => {
    expect(trafficAlerts(base({ campaigns: [camp({ spend: 10000, sales: 3 })] }))).toEqual([]);
  });

  it("gasto sem venda (mínimo R$ 50 ou 2× o CAC médio)", () => {
    expect(ids(base({ campaigns: [camp({ spend: 4999 })] }))).toEqual([]);
    expect(ids(base({ campaigns: [camp({ spend: 5000 })] }))).toEqual(["sem-venda-c1"]);
    // CAC médio R$ 40 → limite R$ 80.
    expect(ids(base({ averageCac: 4000, campaigns: [camp({ spend: 7000 })] }))).toEqual([]);
    expect(trafficAlerts(base({ campaigns: [camp({ spend: 8000 })] }))[0]!.title).toContain("R$ 80,00");
  });

  it("CAC subindo só com vendas suficientes nas duas semanas", () => {
    const c = camp({ spend: 20000, sales: 2, prevSpend: 10000, prevSales: 2 }); // R$100 vs R$50
    expect(ids(base({ campaigns: [c] }))).toEqual(["cac-subindo-c1"]);
    expect(ids(base({ campaigns: [{ ...c, prevSales: 1, prevSpend: 5000 }] }))).toEqual([]);
    expect(ids(base({ campaigns: [{ ...c, spend: 14000 }] }))).toEqual([]); // 70 < 1,5×50
  });

  it("orçamento total quase no fim só em campanha ativa", () => {
    const c = camp({ spend: 9000, sales: 2, lifetimeBudget: 100000, budgetRemaining: 9000 });
    expect(ids(base({ campaigns: [c] }))).toEqual(["orcamento-c1"]);
    expect(ids(base({ campaigns: [{ ...c, effectiveStatus: "PAUSED" }] }))).toEqual([]);
    expect(ids(base({ campaigns: [{ ...c, budgetRemaining: 20000 }] }))).toEqual([]);
  });

  it("anúncio reprovado, sem venda e com poucos cliques; ordem por gravidade", () => {
    const a = trafficAlerts(
      base({
        withoutIds: 2,
        ads: [
          {
            id: "a1",
            name: "Vídeo",
            spend: 6000,
            sales: 0,
            impressions: 5000,
            linkClicks: 10,
            effectiveStatus: "ACTIVE",
          },
          {
            id: "a2",
            name: "Imagem",
            spend: 100,
            sales: 0,
            impressions: 100,
            linkClicks: 1,
            effectiveStatus: "DISAPPROVED",
          },
        ],
      }),
    );
    expect(a.map((x) => x.id)).toEqual([
      "problema-a2",
      "anuncio-sem-venda-a1",
      "ctr-a1",
      "sem-identificacao",
    ]);
    expect(a.map((x) => x.level)).toEqual(["alta", "media", "info", "info"]);
  });

  it("conexão vencendo e dados parados", () => {
    expect(ids(base({ tokenDaysLeft: 3 }))).toEqual(["conexao"]);
    expect(ids(base({ minutesSinceSync: null }))).toEqual(["sem-dados"]);
    expect(ids(base({ minutesSinceSync: 179, syncIntervalMinutes: 15 }))).toEqual([]);
    expect(ids(base({ minutesSinceSync: 181, syncIntervalMinutes: 15 }))).toEqual(["dados-parados"]);
    expect(ids(base({ minutesSinceSync: 1500, syncIntervalMinutes: 0 }))).toEqual(["dados-parados"]);
  });

  it("variação entre períodos", () => {
    expect(periodChange(150, 100)).toBe(50);
    expect(periodChange(80, 100)).toBe(-20);
    expect(periodChange(5, 0)).toBeNull();
  });
});
