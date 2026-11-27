import "server-only";
import { prisma as base } from "@tmp/db";
import "./company";
import { currentCompanyId } from "./tenant";

/**
 * Cliente do banco com SEPARAÇÃO POR EMPRESA automática.
 * Toda consulta a uma tabela de empresa recebe o filtro companyId da empresa aberta, e toda gravação
 * recebe o companyId. Assim, nenhuma tela ou rotina consegue ler ou alterar dados de outra empresa,
 * mesmo que esqueça o filtro. Tabelas do sistema todo (usuários, sessões, auditoria) não são filtradas.
 *
 * Configurações da empresa: chaves "traffic.*" da tabela settings são guardadas como "<empresa>:traffic.*".
 */
export const COMPANY_MODELS = new Set([
  "MetaConnection",
  "MetaAdAccount",
  "MetaOAuthState",
  "MetaCampaign",
  "MetaAdSet",
  "MetaAd",
  "MetaCreative",
  "MetaInsightDaily",
  "MetaSyncRun",
  "TrafficAnalysis",
  "TrafficAction",
  "MetaConversionEvent",
  "Lead",
  "Sale",
  // Marketing IA
  "Brand",
  "BrandFact",
  "Creative",
  "CreativeVersion",
  "MediaAsset",
  "MarketingGeneration",
  "VideoJob",
  "CanvaConnection",
  "CanvaOAuthState",
  "MetaAdSubmission",
]);

const COMPANY_SETTING = /^traffic\./;
export const companySettingKey = (companyId: string, key: string) => `${companyId}:${key}`;

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

function scopeSettingKey(args: Args, companyId: string) {
  const fix = (o?: Record<string, unknown>) => {
    if (o && typeof o.key === "string" && COMPANY_SETTING.test(o.key))
      o.key = companySettingKey(companyId, o.key);
  };
  fix(args.where);
  fix(args.create);
  if (args.data && !Array.isArray(args.data)) fix(args.data as Record<string, unknown>);
}

export const prisma = base.$extends({
  name: "separacao-por-empresa",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model === "Setting") {
          const a = (args ?? {}) as Args;
          const where = a.where?.key;
          const touches =
            (typeof where === "string" && COMPANY_SETTING.test(where)) ||
            (typeof a.create?.key === "string" && COMPANY_SETTING.test(a.create.key));
          if (touches) scopeSettingKey(a, await currentCompanyId());
          return query(a);
        }
        if (!COMPANY_MODELS.has(model)) return query(args);
        const companyId = await currentCompanyId();
        const a = { ...((args ?? {}) as Args) };
        switch (operation) {
          case "create":
            a.data = { ...(a.data as object), companyId };
            break;
          case "createMany":
          case "createManyAndReturn":
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d) => ({
              ...(d as object),
              companyId,
            }));
            break;
          case "upsert":
            a.where = { ...a.where, companyId };
            a.create = { ...a.create, companyId };
            break;
          default:
            // find*, update*, delete*, count, aggregate, groupBy
            a.where = { ...(a.where ?? {}), companyId };
        }
        return query(a as typeof args);
      },
    },
  },
});

export type ScopedPrisma = typeof prisma;
