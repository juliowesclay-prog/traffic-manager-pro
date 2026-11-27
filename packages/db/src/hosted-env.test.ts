import { describe, expect, it } from "vitest";
import { applyHostedDefaults } from "./hosted-env";

const master = "uma-frase-de-teste-com-mais-de-32-caracteres";

describe("prévia na Vercel", () => {
  it("fora da Vercel não muda nada", () => {
    const env: NodeJS.ProcessEnv = { SEGREDO_MESTRE: master };
    applyHostedDefaults(env);
    expect(env).toEqual({ SEGREDO_MESTRE: master });
  });
  it("na Vercel: homologação, simulados, chaves derivadas e estáveis", () => {
    const a: NodeJS.ProcessEnv = { VERCEL: "1", SEGREDO_MESTRE: master, VERCEL_PROJECT_PRODUCTION_URL: "tmp.vercel.app" };
    const b: NodeJS.ProcessEnv = { ...a };
    applyHostedDefaults(a);
    applyHostedDefaults(b);
    expect(a).toMatchObject({ APP_ENV: "homologacao", META_PROVIDER: "simulado", AI_PROVIDER: "simulado", APP_URL: "https://tmp.vercel.app", TRUST_PROXY_HOPS: "1" });
    expect(Buffer.from(a.DATA_ENCRYPTION_KEY!, "base64")).toHaveLength(32);
    expect(Buffer.from(a.HASH_PEPPER!, "base64")).toHaveLength(32);
    expect(a.DATA_ENCRYPTION_KEY).not.toBe(a.HASH_PEPPER);
    expect(a.DATA_ENCRYPTION_KEY).toBe(b.DATA_ENCRYPTION_KEY);
    expect(a.CRON_SECRET!.length).toBeGreaterThanOrEqual(32);
  });
  it("variável definida vence; produção não é tocada", () => {
    const env: NodeJS.ProcessEnv = { VERCEL: "1", SEGREDO_MESTRE: master, META_PROVIDER: "meta" };
    applyHostedDefaults(env);
    expect(env.META_PROVIDER).toBe("meta");
    const prod: NodeJS.ProcessEnv = { VERCEL: "1", APP_ENV: "production", SEGREDO_MESTRE: master };
    applyHostedDefaults(prod);
    expect(prod.DATA_ENCRYPTION_KEY).toBeUndefined();
    expect(prod.META_PROVIDER).toBeUndefined();
  });
});
