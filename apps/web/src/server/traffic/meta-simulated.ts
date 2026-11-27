import "server-only";
import { randomBytes } from "node:crypto";
import { META_SCOPES } from "@tmp/core";
import { MetaError, type MetaGateway } from "./meta-gateway";
import {
  simulatedConversions,
  simulatedPublisher,
  simulatedReader,
  simulatedWriter,
} from "./meta-simulated-ads";

/**
 * Meta SIMULADA — somente desenvolvimento e testes (recusa produção). Não fala com a Meta: a "tela de
 * autorização" é a página local /dev/meta-autorizar e as contas são DEMO. Serve para construir e
 * testar o módulo sem credenciais; nunca gera números de produção.
 */

function guard() {
  if (process.env.APP_ENV === "production")
    throw new MetaError("A Meta simulada não pode ser usada em produção.");
}
const appUrl = () => process.env.APP_URL ?? "http://localhost:3300";

export const metaSimulatedGateway: MetaGateway = {
  read: simulatedReader,
  write: simulatedWriter,
  conversions: simulatedConversions,
  publish: simulatedPublisher,
  name: "simulado",

  authorizeUrl(state, redirectUri) {
    guard();
    const p = new URLSearchParams({ state, redirect_uri: redirectUri });
    return `${appUrl()}/dev/meta-autorizar?${p.toString()}`;
  },

  async exchangeCode(code) {
    guard();
    if (!/^sim_code_(completo|parcial)_[A-Za-z0-9_-]{8,}$/.test(code))
      throw new MetaError("A Meta recusou a operação.", "simulado: código inválido");
    const kind = code.includes("_parcial_") ? "parcial" : "completo";
    return {
      token: `sim_token_${kind}_${randomBytes(12).toString("base64url")}`,
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
    };
  },

  async inspectToken(token) {
    guard();
    const valid = token.startsWith("sim_token_");
    return {
      valid,
      scopes: token.startsWith("sim_token_parcial_") ? ["ads_read"] : [...META_SCOPES],
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
    };
  },

  async me() {
    guard();
    return { id: "1000000000000001", name: "DEMO Usuário Meta" };
  },

  async adAccounts() {
    guard();
    return [
      {
        accountId: "act_1000000000000001",
        name: "DEMO Empresa — Anúncios",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        accountStatus: 1,
        businessName: "DEMO Gerenciador de Negócios",
      },
      {
        accountId: "act_1000000000000002",
        name: "DEMO Conta antiga (encerrada)",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        accountStatus: 101,
        businessName: "DEMO Gerenciador de Negócios",
      },
    ];
  },

  async revoke() {
    guard();
  },
};
