import path from "node:path";

/**
 * Configuração do armazenamento lida do ambiente (sem segredos no código).
 * STORAGE_DRIVER=local → disco (proibido na Vercel, onde o disco é temporário).
 * STORAGE_DRIVER=r2 → R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   (R2_ENDPOINT opcional: outro S3 compatível, como um MinIO local nos testes).
 */
export type S3Config = {
  driver: "r2";
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};
export type StorageConfig = S3Config | { driver: "local"; dir: string };

export function r2Endpoint(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT.replace(/\/+$/, "");
  if (env.R2_ACCOUNT_ID && /^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID))
    return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return null;
}

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig | null {
  const driver = env.STORAGE_DRIVER ?? "local";
  if (driver === "r2") {
    const endpoint = r2Endpoint(env);
    if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) return null;
    return {
      driver: "r2",
      endpoint,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      region: env.R2_REGION || "auto",
    };
  }
  if (driver === "local" && !env.VERCEL)
    return { driver: "local", dir: path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR || ".storage") };
  return null;
}
