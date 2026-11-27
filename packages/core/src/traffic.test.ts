import { describe, expect, it } from "vitest";
import { can } from "./rbac";
import {
  isMetaAdAccountId,
  metaAccountStatusLabel,
  metaAccountUsable,
  metaAuthorizeUrl,
  metaCallbackErrorMessage,
  metaTokenHealth,
  missingMetaScopes,
} from "./traffic";

describe("Gestor de Tráfego: conexão com a Meta", () => {
  it("permissões obrigatórias", () => {
    expect(missingMetaScopes(["ads_read", "ads_management", "business_management"])).toEqual([]);
    expect(missingMetaScopes(["ads_read"])).toEqual(["ads_management"]);
    expect(missingMetaScopes([])).toEqual(["ads_read", "ads_management"]);
  });

  it("validade da chave: ok, perto de vencer, vencida e sem validade", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const in_ = (d: number) => new Date(now.getTime() + d * 86_400_000);
    expect(metaTokenHealth(in_(59), now)).toEqual({ state: "ok", daysLeft: 59 });
    expect(metaTokenHealth(in_(7), now)).toEqual({ state: "ok", daysLeft: 7 });
    expect(metaTokenHealth(in_(6.5), now)).toEqual({ state: "vence_em_breve", daysLeft: 6 });
    expect(metaTokenHealth(in_(-1), now)).toEqual({ state: "vencido", daysLeft: 0 });
    expect(metaTokenHealth(null, now)).toEqual({ state: "sem_validade" });
  });

  it("situação e formato das contas", () => {
    expect(metaAccountStatusLabel(1)).toBe("Ativa");
    expect(metaAccountStatusLabel(101)).toBe("Encerrada");
    expect(metaAccountStatusLabel(55)).toBe("Situação 55");
    expect(metaAccountUsable(1)).toBe(true);
    expect(metaAccountUsable(2)).toBe(false);
    expect(isMetaAdAccountId("act_1234567890")).toBe(true);
    expect(isMetaAdAccountId("1234567890")).toBe(false);
    expect(isMetaAdAccountId("act_12; DROP")).toBe(false);
  });

  it("endereço de autorização com state e permissões (ou config_id)", () => {
    const base = { graphVersion: "v24.0", appId: "123", redirectUri: "https://x/cb", state: "abc" };
    const u = new URL(metaAuthorizeUrl(base));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v24.0/dialog/oauth");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("scope")).toBe("ads_read,ads_management,business_management");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/cb");
    const c = new URL(metaAuthorizeUrl({ ...base, configId: "999" }));
    expect(c.searchParams.get("config_id")).toBe("999");
    expect(c.searchParams.has("scope")).toBe(false);
  });

  it("mensagens de retorno sem repassar o texto da Meta", () => {
    expect(metaCallbackErrorMessage("access_denied", "user_denied")).toMatch(/cancelada/);
    expect(metaCallbackErrorMessage("server_error", "<script>")).not.toContain("<script>");
  });

  it("perfil Marketing só mexe no tráfego", () => {
    expect(can(["MARKETING"], "traffic:manage")).toBe(true);
    expect(can(["MARKETING"], "admin:access")).toBe(true);
    expect(can(["MARKETING"], "members:read")).toBe(false);
    expect(can(["MARKETING"], "finance:read")).toBe(false);
    expect(can(["SUPERADMIN"], "traffic:manage")).toBe(true);
    expect(can(["FINANCEIRO"], "traffic:read")).toBe(false);
  });
});
