import "server-only";
import { MetaError, type MetaGateway } from "./meta-gateway";
import { metaGraphGateway } from "./meta-graph";
import { metaSimulatedGateway } from "./meta-simulated";

/** Provedor escolhido por META_PROVIDER ("meta" ou "simulado"); sem valor = módulo ainda não configurado. */
export function metaProviderName(): "meta" | "simulado" | null {
  const v = process.env.META_PROVIDER;
  if (v === "meta") return "meta";
  if (v === "simulado" && process.env.APP_ENV !== "production") return "simulado";
  return null;
}

export function activeMeta(): MetaGateway {
  const name = metaProviderName();
  if (name === "meta") return metaGraphGateway;
  if (name === "simulado") return metaSimulatedGateway;
  throw new MetaError(
    "A integração com a Meta ainda não foi configurada.",
    `META_PROVIDER=${process.env.META_PROVIDER}`,
  );
}

/** Gateway de uma conexão já gravada (pelo nome gravado nela). */
export function metaByName(name: string): MetaGateway {
  if (name === "meta") return metaGraphGateway;
  if (name === "simulado" && process.env.APP_ENV !== "production") return metaSimulatedGateway;
  throw new MetaError("Provedor da Meta desconhecido.", name);
}

/** Endereço de retorno da autorização (cadastrar igual no app da Meta: "URIs de redirecionamento do OAuth válidos"). */
export const metaRedirectUri = () =>
  `${process.env.APP_URL ?? "http://localhost:3200"}/api/v1/admin/trafego/meta/retorno`;

export { MetaError };
