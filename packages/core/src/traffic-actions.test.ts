import { describe, expect, it } from "vitest";
import {
  activeDailyBudget,
  approvalBlock,
  changedSinceRequest,
  normalizeActionSettings,
  planTrafficAction,
  type ActionTarget,
  type BudgetTree,
  type TrafficActionSettings,
} from "./traffic-actions";
import { can } from "./rbac";

const tree: BudgetTree = {
  campaigns: [
    { id: "c1", status: "ACTIVE", dailyBudget: 5000, lifetimeBudget: null },
    { id: "c2", status: "PAUSED", dailyBudget: 2000, lifetimeBudget: null },
    { id: "c3", status: "ACTIVE", dailyBudget: null, lifetimeBudget: null }, // orçamento nos conjuntos
    { id: "c4", status: "PAUSED", dailyBudget: null, lifetimeBudget: 90000 },
  ],
  adSets: [
    { id: "s1", campaignId: "c3", status: "ACTIVE", dailyBudget: 1000, lifetimeBudget: null },
    { id: "s2", campaignId: "c3", status: "PAUSED", dailyBudget: 1500, lifetimeBudget: null },
    { id: "s3", campaignId: "c1", status: "ACTIVE", dailyBudget: null, lifetimeBudget: null },
  ],
};
const cap: TrafficActionSettings = { enabled: true, dailyCapCents: 10000, maxIncreasePct: 30 };
const camp = (id: string): ActionTarget => {
  const c = tree.campaigns.find((x) => x.id === id)!;
  return { level: "CAMPANHA", name: id, ...c };
};
const set = (id: string): ActionTarget => {
  const s = tree.adSets.find((x) => x.id === id)!;
  return {
    level: "CONJUNTO",
    id,
    name: id,
    status: s.status,
    dailyBudget: s.dailyBudget,
    lifetimeBudget: s.lifetimeBudget,
  };
};

describe("orçamento diário ativo", () => {
  it("soma campanhas ativas com orçamento e, sem ele, os conjuntos ativos", () => {
    expect(activeDailyBudget(tree)).toEqual({ total: 6000, lifetimeIds: [] });
  });
});

describe("planejar ação", () => {
  it("pausar diminui o gasto: sem aprovação", () => {
    const r = planTrafficAction({ target: camp("c1"), kind: "PAUSAR", tree, settings: cap });
    expect(r).toMatchObject({
      ok: true,
      plan: { increasesSpend: false, totalBefore: 6000, totalAfter: 1000 },
    });
  });

  it("reduzir orçamento funciona mesmo sem teto definido", () => {
    const r = planTrafficAction({
      target: camp("c1"),
      kind: "ORCAMENTO",
      newBudget: 3000,
      tree,
      settings: { ...cap, dailyCapCents: null },
    });
    expect(r).toMatchObject({ ok: true, plan: { increasesSpend: false, fromBudget: 5000, toBudget: 3000 } });
  });

  it("reativar aumenta o gasto, respeita o teto e precisa de aprovação", () => {
    const ok = planTrafficAction({ target: camp("c2"), kind: "REATIVAR", tree, settings: cap });
    expect(ok).toMatchObject({ ok: true, plan: { increasesSpend: true, totalAfter: 8000 } });
    const over = planTrafficAction({
      target: camp("c2"),
      kind: "REATIVAR",
      tree,
      settings: { ...cap, dailyCapCents: 7000 },
    });
    expect(over).toMatchObject({ ok: false, message: expect.stringContaining("Passaria do teto") });
  });

  it("sem teto, nada que aumente o gasto é aceito", () => {
    const r = planTrafficAction({
      target: camp("c2"),
      kind: "REATIVAR",
      tree,
      settings: { ...cap, dailyCapCents: null },
    });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("teto") });
  });

  it("aumento de orçamento tem limite por vez", () => {
    expect(
      planTrafficAction({ target: camp("c1"), kind: "ORCAMENTO", newBudget: 6500, tree, settings: cap }),
    ).toMatchObject({ ok: true, plan: { increasesSpend: true, increasePct: 30, totalAfter: 7500 } });
    expect(
      planTrafficAction({ target: camp("c1"), kind: "ORCAMENTO", newBudget: 6501, tree, settings: cap }),
    ).toMatchObject({ ok: false, message: expect.stringContaining("o máximo por vez é 30%") });
  });

  it("orçamento: mínimo, igual ao atual, anúncio, orçamento nos conjuntos e orçamento total", () => {
    const p = (target: ActionTarget, newBudget: number | null) =>
      planTrafficAction({ target, kind: "ORCAMENTO", newBudget, tree, settings: cap });
    expect(p(camp("c1"), 50)).toMatchObject({ ok: false, message: expect.stringContaining("mínimo") });
    expect(p(camp("c1"), 5000)).toMatchObject({ ok: false, message: expect.stringContaining("igual") });
    expect(p(camp("c1"), null)).toMatchObject({ ok: false });
    expect(p(camp("c1"), 12.5)).toMatchObject({ ok: false });
    expect(p({ ...camp("c1"), level: "ANUNCIO" }, 4000)).toMatchObject({ ok: false });
    expect(p(camp("c3"), 4000)).toMatchObject({ ok: false, message: expect.stringContaining("conjuntos") });
    expect(p(set("s3"), 4000)).toMatchObject({ ok: false, message: expect.stringContaining("campanha") });
    expect(p(camp("c4"), 4000)).toMatchObject({ ok: false, message: expect.stringContaining("total") });
  });

  it("conjunto de campanha sem orçamento: aumento conta no total", () => {
    const r = planTrafficAction({ target: set("s2"), kind: "REATIVAR", tree, settings: cap });
    expect(r).toMatchObject({ ok: true, plan: { totalBefore: 6000, totalAfter: 7500 } });
  });

  it("reativar item com orçamento total é recusado (o teto diário não controla)", () => {
    const r = planTrafficAction({ target: camp("c4"), kind: "REATIVAR", tree, settings: cap });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("orçamento total") });
  });

  it("estados inválidos: encerrado, pausar pausado, reativar ativo", () => {
    expect(
      planTrafficAction({
        target: { ...camp("c1"), status: "ARCHIVED" },
        kind: "PAUSAR",
        tree,
        settings: cap,
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining("encerrado") });
    expect(planTrafficAction({ target: camp("c2"), kind: "PAUSAR", tree, settings: cap })).toMatchObject({
      ok: false,
    });
    expect(planTrafficAction({ target: camp("c1"), kind: "REATIVAR", tree, settings: cap })).toMatchObject({
      ok: false,
    });
  });
});

describe("aprovação", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const a = { status: "PENDENTE", requestedById: "u1", expiresAt: new Date("2026-11-27T00:00:00Z") };
  it("quem pediu não aprova; vencido e já decidido não aprovam", () => {
    expect(approvalBlock(a, "u2", now)).toBeNull();
    expect(approvalBlock(a, "u1", now)).toContain("próprio pedido");
    expect(approvalBlock({ ...a, expiresAt: now }, "u2", now)).toContain("venceu");
    expect(approvalBlock({ ...a, status: "RECUSADA" }, "u2", now)).toContain("não está mais");
  });

  it("detecta mudança na Meta desde o pedido", () => {
    expect(
      changedSinceRequest(
        { kind: "REATIVAR", fromStatus: "PAUSED", fromBudget: 2000 },
        { status: "PAUSED", dailyBudget: 9999 },
      ),
    ).toBe(false);
    expect(
      changedSinceRequest(
        { kind: "REATIVAR", fromStatus: "PAUSED", fromBudget: 2000 },
        { status: "ACTIVE", dailyBudget: 2000 },
      ),
    ).toBe(true);
    expect(
      changedSinceRequest(
        { kind: "ORCAMENTO", fromStatus: "ACTIVE", fromBudget: 5000 },
        { status: "ACTIVE", dailyBudget: 5500 },
      ),
    ).toBe(true);
  });
});

describe("configuração", () => {
  it("valores inválidos viram seguros: desligado, sem teto, aumento padrão", () => {
    expect(normalizeActionSettings(null)).toEqual({
      enabled: false,
      dailyCapCents: null,
      maxIncreasePct: 30,
    });
    expect(normalizeActionSettings({ enabled: "sim", dailyCapCents: -5, maxIncreasePct: 500 })).toEqual({
      enabled: false,
      dailyCapCents: null,
      maxIncreasePct: 30,
    });
    expect(normalizeActionSettings({ enabled: true, dailyCapCents: 20000, maxIncreasePct: 20 })).toEqual({
      enabled: true,
      dailyCapCents: 20000,
      maxIncreasePct: 20,
    });
  });
});

describe("permissões", () => {
  it("só o superadministrador aprova; marketing pede", () => {
    expect(can(["SUPERADMIN"], "traffic:approve")).toBe(true);
    expect(can(["MARKETING"], "traffic:approve")).toBe(false);
    expect(can(["MARKETING"], "traffic:manage")).toBe(true);
    expect(can(["GESTOR"], "traffic:approve")).toBe(true);
    expect(can(["LEITURA"], "traffic:manage")).toBe(false);
  });
});
